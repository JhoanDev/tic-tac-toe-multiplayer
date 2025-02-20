import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApi } from '@aws-sdk/client-apigatewaymanagementapi';

const TABLE_NAME = 'jogo-da-velha-DB';
const CONEXOES_TABLE_NAME = 'conexao-jogo-da-velha-DB';
const dynamo = DynamoDBDocument.from(new DynamoDB({ region: 'us-east-1' }));

export const handler = async (event) => {
    console.log('Evento recebido:', JSON.stringify(event, null, 2));
    const { requestContext, body } = event;
    const connectionId = requestContext.connectionId;
    const routeKey = requestContext.routeKey;

    const apiGatewayClient = new ApiGatewayManagementApi({
        endpoint: `https://${requestContext.domainName}/${requestContext.stage}`,
    });

    try {
        switch (routeKey) {
            case '$connect':
                await dynamo.put({ TableName: CONEXOES_TABLE_NAME, Item: { connectionId } });
                return { statusCode: 200, body: JSON.stringify({ message: 'Conexão estabelecida' }) };

            case '$disconnect':
                await dynamo.delete({ TableName: CONEXOES_TABLE_NAME, Key: { connectionId } });
                return { statusCode: 200, body: JSON.stringify({ message: 'Conexão encerrada' }) };

            case '$default':
                const { action, partidaId, posicao, jogador, playerId } = JSON.parse(body);

                if (action === 'iniciarPartida') {
                    const partida = {
                        partidaId: `partida-${Date.now()}`,
                        jogadorX: connectionId,
                        jogadorXId: playerId,
                        jogadorO: null,
                        jogadorOId: null,
                        estadoDoTabuleiro: Array(9).fill(null),
                        vezDe: 'X',
                        vencedor: null,
                        pontuacaoX: 0,
                        pontuacaoO: 0,
                    };
                    await dynamo.put({ TableName: TABLE_NAME, Item: partida });

                    await apiGatewayClient.postToConnection({
                        ConnectionId: connectionId,
                        Data: JSON.stringify({
                            action: 'atualizarPartida',
                            partidaId: partida.partidaId,
                            jogador: 'X',
                            playerId: partida.jogadorXId,
                            jogadorX: partida.jogadorX,
                            jogadorO: partida.jogadorO,
                            estadoDoTabuleiro: partida.estadoDoTabuleiro,
                            vezDe: partida.vezDe,
                            vencedor: partida.vencedor,
                            pontuacaoX: partida.pontuacaoX,
                            pontuacaoO: partida.pontuacaoO,
                        }),
                    });

                    return { statusCode: 200, body: JSON.stringify({ partidaId: partida.partidaId, message: 'Partida iniciada!' }) };
                }

                if (action === 'entrarPartida') {
                    const partida = await dynamo.get({ TableName: TABLE_NAME, Key: { partidaId } });

                    if (!partida.Item) throw new Error('Partida não encontrada.');
                    if (partida.Item.jogadorO) throw new Error('A partida já está cheia.');
                    if (partida.Item.jogadorXId === playerId) throw new Error('Você já está participando desta partida como jogador X.');

                    partida.Item.jogadorO = connectionId;
                    partida.Item.jogadorOId = playerId;

                    await dynamo.put({ TableName: TABLE_NAME, Item: partida.Item });

                    await apiGatewayClient.postToConnection({
                        ConnectionId: partida.Item.jogadorX,
                        Data: JSON.stringify({
                            action: 'atualizarPartida',
                            partidaId: partida.Item.partidaId,
                            jogador: 'X',
                            playerId: partida.Item.jogadorXId,
                            jogadorX: partida.Item.jogadorX,
                            jogadorO: partida.Item.jogadorO,
                            estadoDoTabuleiro: partida.Item.estadoDoTabuleiro,
                            vezDe: partida.Item.vezDe,
                            vencedor: partida.Item.vencedor,
                            pontuacaoX: partida.Item.pontuacaoX,
                            pontuacaoO: partida.Item.pontuacaoO,
                        }),
                    });

                    await apiGatewayClient.postToConnection({
                        ConnectionId: partida.Item.jogadorO,
                        Data: JSON.stringify({
                            action: 'atualizarPartida',
                            partidaId: partida.Item.partidaId,
                            jogador: 'O',
                            playerId: partida.Item.jogadorOId,
                            jogadorX: partida.Item.jogadorX,
                            jogadorO: partida.Item.jogadorO,
                            estadoDoTabuleiro: partida.Item.estadoDoTabuleiro,
                            vezDe: partida.Item.vezDe,
                            vencedor: partida.Item.vencedor,
                            pontuacaoX: partida.Item.pontuacaoX,
                            pontuacaoO: partida.Item.pontuacaoO,
                        }),
                    });

                    return { statusCode: 200, body: JSON.stringify({ message: 'Você entrou na partida!', jogador: 'O' }) };
                }

                if (action === 'jogada') {
                    const partida = await dynamo.get({ TableName: TABLE_NAME, Key: { partidaId } });

                    if (!partida.Item) throw new Error('Partida não encontrada.');
                    if (partida.Item.vencedor) throw new Error('A partida já foi finalizada.');

                    const jogadorAtual = partida.Item.vezDe === 'X' ? partida.Item.jogadorXId : partida.Item.jogadorOId;
                    if (playerId !== jogadorAtual) throw new Error('Não é sua vez!');

                    partida.Item.estadoDoTabuleiro[posicao] = jogador;
                    partida.Item.vezDe = jogador === 'X' ? 'O' : 'X';
                    partida.Item.vencedor = verificarVencedor(partida.Item.estadoDoTabuleiro);

                    if (partida.Item.vencedor) {
                        if (partida.Item.vencedor === 'X') partida.Item.pontuacaoX += 1;
                        else if (partida.Item.vencedor === 'O') partida.Item.pontuacaoO += 1;
                    }

                    await dynamo.put({ TableName: TABLE_NAME, Item: partida.Item });

                    const mensagem = {
                        action: 'atualizarPartida',
                        partidaId: partida.Item.partidaId,
                        jogador: partida.Item.vezDe === 'X' ? 'X' : 'O',
                        playerId: partida.Item.vezDe === 'X' ? partida.Item.jogadorXId : partida.Item.jogadorOId,
                        jogadorX: partida.Item.jogadorX,
                        jogadorO: partida.Item.jogadorO,
                        estadoDoTabuleiro: partida.Item.estadoDoTabuleiro,
                        vezDe: partida.Item.vezDe,
                        vencedor: partida.Item.vencedor,
                        pontuacaoX: partida.Item.pontuacaoX,
                        pontuacaoO: partida.Item.pontuacaoO,
                    };

                    await apiGatewayClient.postToConnection({ ConnectionId: partida.Item.jogadorX, Data: JSON.stringify(mensagem) });
                    await apiGatewayClient.postToConnection({ ConnectionId: partida.Item.jogadorO, Data: JSON.stringify(mensagem) });

                    return { statusCode: 200, body: JSON.stringify({ message: 'Jogada registrada!', estadoDoTabuleiro: partida.Item.estadoDoTabuleiro, vencedor: partida.Item.vencedor }) };
                }

                if (action === 'reiniciarPartida') {
                    const partida = await dynamo.get({ TableName: TABLE_NAME, Key: { partidaId } });

                    if (!partida.Item) throw new Error('Partida não encontrada.');

                    partida.Item.estadoDoTabuleiro = Array(9).fill(null);
                    partida.Item.vezDe = 'X';
                    partida.Item.vencedor = null;

                    await dynamo.put({ TableName: TABLE_NAME, Item: partida.Item });

                    const mensagem = {
                        action: 'atualizarPartida',
                        partidaId: partida.Item.partidaId,
                        jogador: partida.Item.vezDe === 'X' ? 'X' : 'O',
                        playerId: partida.Item.vezDe === 'X' ? partida.Item.jogadorXId : partida.Item.jogadorOId,
                        jogadorX: partida.Item.jogadorX,
                        jogadorO: partida.Item.jogadorO,
                        estadoDoTabuleiro: partida.Item.estadoDoTabuleiro,
                        vezDe: partida.Item.vezDe,
                        vencedor: partida.Item.vencedor,
                        pontuacaoX: partida.Item.pontuacaoX,
                        pontuacaoO: partida.Item.pontuacaoO,
                    };

                    await apiGatewayClient.postToConnection({ ConnectionId: partida.Item.jogadorX, Data: JSON.stringify(mensagem) });
                    await apiGatewayClient.postToConnection({ ConnectionId: partida.Item.jogadorO, Data: JSON.stringify(mensagem) });

                    return { statusCode: 200, body: JSON.stringify({ message: 'Partida reiniciada!' }) };
                }

                throw new Error('Ação inválida.');

            default:
                throw new Error(`Rota não suportada: ${routeKey}`);
        }
    } catch (error) {
        console.error('Erro durante a execução:', error);
        return { statusCode: 400, body: JSON.stringify({ error: error.message || 'Erro interno no servidor' }) };
    }
};

const verificarVencedor = (tabuleiro) => {
    const linhasVencedoras = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];

    for (const linha of linhasVencedoras) {
        const [a, b, c] = linha;
        if (tabuleiro[a] && tabuleiro[a] === tabuleiro[b] && tabuleiro[a] === tabuleiro[c]) {
            return tabuleiro[a];
        }
    }

    if (!tabuleiro.includes(null)) {
        return 'Empate';
    }

    return null;
};