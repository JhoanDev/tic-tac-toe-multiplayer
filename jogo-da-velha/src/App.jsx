import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

const WEBSOCKET_URL = 'wss://0vj6zn1h39.execute-api.us-east-1.amazonaws.com/dev/';

let xpontos = 0;
let opontos = 0;

function App() {
    const [tabuleiro, setTabuleiro] = useState(Array(9).fill(null));
    const [jogador, setJogador] = useState(null);
    const [partidaId, setPartidaId] = useState(null);
    const [vezDe, setVezDe] = useState("X");
    const [vencedor, setVencedor] = useState(null);
    const [playerId, setPlayerId] = useState(null);
    const [pontuacao, setPontuacao] = useState({ X: 0, O: 0 });
    const [inputPartidaId, setInputPartidaId] = useState('');
    const [loading, setLoading] = useState(false);
    const [mensagemStatus, setMensagemStatus] = useState('');
    const [aguardandoJogador2, setAguardandoJogador2] = useState(false);
    const [mensagemJogador, setMensagemJogador] = useState('');
    const socketRef = useRef(null);

    const enviarMensagem = (mensagem) => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(mensagem);
        } else {
            console.error('WebSocket não está conectado.');
            setMensagemStatus('Erro: WebSocket não está conectado.');
        }
    };

    useEffect(() => {
        const id = uuidv4();
        setPlayerId(id);
        const conectarWebSocket = () => {
            socketRef.current = new WebSocket(WEBSOCKET_URL);
            socketRef.current.onopen = () => {
                console.log('Conectado ao WebSocket');
                setMensagemStatus('Conectado ao servidor.');
            };
            socketRef.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('Mensagem recebida:', data);
                    console.log(data.pontuacaoX);

                    if (data.erro) {
                        setMensagemStatus(`Erro: ${data.erro}`);
                        setLoading(false);
                        return;
                    }

                    if (data.action === 'atualizarPartida') {
                        setPartidaId(data.partidaId);
                        setJogador(data.jogador);
                        setTabuleiro(data.estadoDoTabuleiro);
                        setVezDe(data.vezDe);
                        setVencedor(data.vencedor);
                        setAguardandoJogador2(!data.jogadorO);
                        setPontuacao({ X: data.pontuacaoX, O: data.pontuacaoO });

                        if (!mensagemJogador) {
                            setMensagemJogador(`Você é o jogador ${data.jogador}`);
                        }

                        setLoading(false);
                        return;
                    }

                    if (data.message === 'Jogada registrada!') {
                        setTabuleiro(data.estadoDoTabuleiro);
                        setVezDe(data.vezDe);
                        setVencedor(data.vencedor);
                        setPontuacao({ X: data.pontuacaoX, O: data.pontuacaoO });
                        setLoading(false);
                        return;
                    }
                } catch (error) {
                    console.error('Erro ao processar mensagem:', error);
                    setMensagemStatus('Erro ao processar mensagem do servidor.');
                }
            };
            socketRef.current.onclose = () => {
                console.log('Desconectado do WebSocket. Tentando reconectar...');
                setMensagemStatus('Desconectado. Tentando reconectar...');
                setTimeout(conectarWebSocket, 5000);
            };
            socketRef.current.onerror = (error) => {
                console.error('Erro no WebSocket:', error);
                setMensagemStatus('Erro na conexão com o servidor.');
            };
        };
        conectarWebSocket();
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, []);

    const iniciarPartida = async () => {
        setLoading(true);
        setAguardandoJogador2(true);
        const mensagem = JSON.stringify({ action: 'iniciarPartida', playerId });
        enviarMensagem(mensagem);
    };

    const entrarNaPartida = async () => {
        if (!inputPartidaId) {
            setMensagemStatus('Digite o ID da partida.');
            return;
        }
        setLoading(true);
        const mensagem = JSON.stringify({ action: 'entrarPartida', playerId, partidaId: inputPartidaId });
        enviarMensagem(mensagem);
    };

    const fazerJogada = (posicao) => {
        if (tabuleiro[posicao] || vencedor || !jogador || loading || vezDe !== jogador || aguardandoJogador2) {
            return;
        }
        setLoading(true);
        const mensagem = JSON.stringify({ action: 'jogada', partidaId, posicao, jogador, playerId });
        enviarMensagem(mensagem);
    };

    const reiniciarPartida = async () => {
        setLoading(true);
        const mensagem = JSON.stringify({ action: 'reiniciarPartida', partidaId, playerId });
        enviarMensagem(mensagem);
    };

    const renderTabuleiro = () => {
        return tabuleiro.map((valor, index) => (
            <div
                key={index}
                className={`w-20 h-20 flex items-center justify-center border-4 border-gray-600 text-3xl font-bold ${valor === 'X' ? 'text-blue-400' : 'text-yellow-400'
                    } ${vencedor || aguardandoJogador2 ? 'cursor-not-allowed opacity-75' : 'cursor-pointer hover:bg-gray-800 transition-colors'
                    }`}
                onClick={() => !vencedor && !aguardandoJogador2 && fazerJogada(index)}
            >
                {valor}
            </div>
        ));
    };

    const mensagemVez = () => {
        if (vezDe === jogador) {
            return 'Sua vez';
        } else {
            return 'Vez do oponente';
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
            <h1 className="text-4xl font-bold mb-8 text-center text-gray-100">
                Jogo da Velha Multiplayer
            </h1>
            {!partidaId && (
                <div className="flex flex-col items-center space-y-6">
                    <div className="flex space-x-4">
                        <button
                            onClick={iniciarPartida}
                            disabled={loading}
                            className="bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 active:bg-blue-700 transition-colors font-semibold text-lg"
                        >
                            {loading ? 'Criando...' : 'Criar Partida'}
                        </button>
                        <button
                            onClick={entrarNaPartida}
                            disabled={loading}
                            className="bg-yellow-500 text-white px-6 py-3 rounded-lg hover:bg-yellow-600 active:bg-yellow-700 transition-colors font-semibold text-lg"
                        >
                            {loading ? 'Entrando...' : 'Entrar na Partida'}
                        </button>
                    </div>
                    <input
                        type="text"
                        className="bg-gray-700 text-white p-3 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 text-center"
                        placeholder="Digite o ID da Partida"
                        value={inputPartidaId}
                        onChange={(e) => setInputPartidaId(e.target.value)}
                    />
                </div>
            )}
            {partidaId && (
                <>
                    <p className="text-lg mb-6 text-gray-300">
                        Partida ID: <span className="font-bold text-blue-400">{partidaId}</span>
                    </p>
                    {mensagemStatus && (
                        <p className="text-lg mb-6 text-gray-400 bg-gray-800 p-4 rounded-lg">
                            {mensagemStatus}
                        </p>
                    )}
                    {aguardandoJogador2 && (
                        <p className="text-lg mb-6 text-yellow-400 animate-pulse">
                            Aguardando o segundo jogador...
                        </p>
                    )}
                    {vencedor && (
                        <p className="text-2xl font-bold text-green-500 mb-6 animate-bounce">
                            {vencedor === 'Empate' ? 'Empate!' : `${vencedor} venceu! 🎉`}
                        </p>
                    )}
                    {vencedor === null && !aguardandoJogador2 && (
                        <p className="text-lg mb-6 text-gray-300">
                            {mensagemVez()}
                        </p>
                    )}
                    <div className="grid grid-cols-3 gap-3 mb-8">
                        {renderTabuleiro()}
                    </div>
                    <div className="mt-6 text-center">
                        <p className="text-lg text-gray-300">Pontuação:</p>
                        <p className="text-xl font-bold">
                            <span className="text-blue-400">X: {pontuacao.X||xpontos}</span> | <span className="text-yellow-400">O: {pontuacao.O||opontos}</span>
                        </p>
                    </div>
                    {vencedor && (
                        <button
                            onClick={reiniciarPartida}
                            className="bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 active:bg-green-700 transition-colors font-semibold text-lg"
                        >
                            Reiniciar Partida
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

export default App;