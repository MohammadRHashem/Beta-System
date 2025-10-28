import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

const API_URL = "https://platform.betaserver.dev:4433";

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        // Only attempt to connect if the user is authenticated
        if (isAuthenticated) {
            const newSocket = io(API_URL, {
                path: "/socket.io/",
                transports: ["websocket", "polling"],
            });

            newSocket.on('connect', () => {
                console.log("[Socket.io] Connection established via Context:", newSocket.id);
            });

            setSocket(newSocket);

            // Disconnect when the provider unmounts or user logs out
            return () => {
                newSocket.disconnect();
            };
        } else if (socket) {
            // If user logs out, disconnect the existing socket
            socket.disconnect();
            setSocket(null);
        }
    }, [isAuthenticated]); // Rerun effect when authentication state changes

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};