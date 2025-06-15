package turn

import (
	"fmt"
	"log"
	"net"
	"sync"

	"github.com/pion/turn/v4"
	"webrtc-server/pkg/webrtcutil"
)

type Server struct {
	server *turn.Server
	wg     sync.WaitGroup
}

func NewServer() (*Server, error) {
	config := webrtcutil.GetConfig()

	udpListener, err := net.ListenPacket("udp4", config.Turn.Address)
	if err != nil {
		return nil, fmt.Errorf("failed to create TURN listener: %w", err)
	}
	server, err := turn.NewServer(turn.ServerConfig{
		Realm: config.Turn.Realm,
		AuthHandler: func(username, realm string, srcAddr net.Addr) ([]byte, bool) {
			if username == config.Turn.Username {
				return []byte(config.Turn.Password), true
			}
			return nil, false
		},
		PacketConnConfigs: []turn.PacketConnConfig{
			{
				PacketConn: udpListener,
				RelayAddressGenerator: &turn.RelayAddressGeneratorStatic{
					RelayAddress: net.ParseIP(config.Turn.PublicIP),
					Address:      "0.0.0.0",
				},
			},
		},
	})

	if err != nil {
		return nil, fmt.Errorf("failed to create TURN server: %w", err)
	}

	return &Server{server: server}, nil
}

func (s *Server) Start() {
	s.wg.Add(1)
	defer s.wg.Done()
	log.Printf("TURN server running on %s (realm: %s)",
		webrtcutil.GetConfig().Turn.Address,
		webrtcutil.GetConfig().Turn.Realm)
}

func (s *Server) Stop() {
	if s.server != nil {
		_ = s.server.Close()
	}
	s.wg.Wait()
	log.Println("TURN server stopped")
}
