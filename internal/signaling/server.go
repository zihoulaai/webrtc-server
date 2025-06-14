package signaling

import (
	"encoding/json"
	"log"
	"sync"
)

type Server struct {
	peers     map[string]*Peer
	peersLock sync.RWMutex
}

func NewServer() *Server {
	return &Server{
		peers: make(map[string]*Peer),
	}
}

func (s *Server) broadcastClientList() {
	s.peersLock.RLock()
	defer s.peersLock.RUnlock()

	clients := make([]ClientInfo, 0, len(s.peers))
	for id := range s.peers {
		clients = append(clients, ClientInfo{ID: id})
	}

	clientList, _ := json.Marshal(clients)
	msg := Message{
		Type: "client-list",
		Data: string(clientList),
	}

	for _, peer := range s.peers {
		peer.Send(msg)
	}
}

func (s *Server) removePeer(peerID string) {
	s.peersLock.Lock()
	defer s.peersLock.Unlock()

	if peer, exists := s.peers[peerID]; exists {
		peer.Conn.Close()
		delete(s.peers, peerID)
		log.Printf("Peer disconnected: %s", peerID)
		s.broadcastClientList()
	}
}
