package signaling

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	peerID := fmt.Sprintf("peer-%d", time.Now().UnixNano())
	peer := &Peer{
		ID:          peerID,
		Conn:        conn,
		ConnectedAt: time.Now(),
	}

	// 添加新对等体
	s.peersLock.Lock()
	s.peers[peerID] = peer
	s.peersLock.Unlock()

	log.Printf("Peer connected: %s", peerID)

	// 发送分配的ID给客户端
	peer.Send(Message{
		Type: "id",
		Data: peerID,
	})

	// 通知所有客户端有新的连接
	s.broadcastClientList()

	// 处理消息
	go s.handlePeerMessages(peer)

	// 设置关闭处理
	conn.SetCloseHandler(func(code int, text string) error {
		s.removePeer(peerID)
		return nil
	})
}

func (s *Server) handlePeerMessages(peer *Peer) {
	for {
		msg, err := peer.ReadMessage()
		if err != nil {
			log.Printf("Read error from %s: %v", peer.ID, err)
			s.removePeer(peer.ID)
			return
		}

		log.Printf("Received message from %s to %s: %s", peer.ID, msg.To, msg.Type)

		s.peersLock.RLock()
		targetPeer, exists := s.peers[msg.To]
		s.peersLock.RUnlock()

		if exists {
			targetPeer.Send(msg)
		} else if msg.To == "" {
			log.Printf("Broadcasting message from %s: %s", peer.ID, msg.Type)
			s.broadcast(peer.ID, msg)
		} else {
			log.Printf("Target peer not found: %s", msg.To)
			peer.Send(Message{
				Type: "error",
				Data: fmt.Sprintf("Peer %s not found", msg.To),
			})
		}
	}
}

func (s *Server) broadcast(senderID string, msg Message) {
	s.peersLock.RLock()
	defer s.peersLock.RUnlock()

	for id, peer := range s.peers {
		if id == senderID {
			continue
		}
		peer.Send(msg)
	}
}

func (s *Server) ListClientsHandler(w http.ResponseWriter, r *http.Request) {
	s.peersLock.RLock()
	defer s.peersLock.RUnlock()

	clients := make([]ClientInfo, 0, len(s.peers))
	for id, peer := range s.peers {
		addr := peer.Conn.RemoteAddr().String()
		clients = append(clients, ClientInfo{
			ID:        id,
			LocalAddr: addr,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(clients)
}
