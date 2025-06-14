package signaling

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Peer struct {
	ID          string
	Conn        *websocket.Conn
	mu          sync.Mutex
	ConnectedAt time.Time
}

type ClientInfo struct {
	ID        string `json:"id"`
	PublicIP  string `json:"public_ip,omitempty"`
	LocalAddr string `json:"local_addr,omitempty"`
}

type Message struct {
	Type string `json:"type"`
	Data string `json:"data"`
	To   string `json:"to,omitempty"`
}

func (p *Peer) Send(msg Message) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.Conn.WriteJSON(msg)
}

func (p *Peer) ReadMessage() (Message, error) {
	var msg Message
	err := p.Conn.ReadJSON(&msg)
	return msg, err
}
