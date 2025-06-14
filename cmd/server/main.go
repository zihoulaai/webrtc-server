package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gorilla/mux"
	"github.com/spf13/viper"

	"webrtc-server/internal/signaling"
	"webrtc-server/internal/turn"
	"webrtc-server/pkg/webrtcutil"
)

func main() {
	configFile := flag.String("config", "config/config.yaml", "Path to config file")
	flag.Parse()

	// 加载配置
	if err := webrtcutil.LoadConfig(*configFile); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// 创建路由器
	router := mux.NewRouter()

	// 初始化信令服务器
	signalServer := signaling.NewServer()
	router.HandleFunc("/ws", signalServer.HandleWebSocket)
	router.HandleFunc("/clients", signalServer.ListClientsHandler).Methods("GET")

	// 设置静态文件服务
	fs := http.FileServer(http.Dir("./static"))
	router.PathPrefix("/static/").Handler(http.StripPrefix("/static/", fs))
	router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./static/index.html")
	})

	// 启动TURN服务器
	turnServer, err := turn.NewServer()
	if err != nil {
		log.Fatalf("Failed to create TURN server: %v", err)
	}
	go turnServer.Start()

	// 启动HTTP服务器
	httpPort := viper.GetString("server.http_port")
	go func() {
		log.Printf("HTTP server starting on :%s", httpPort)
		if err := http.ListenAndServe(":"+httpPort, router); err != nil {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// 等待退出信号
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	log.Println("Shutting down servers...")
	turnServer.Stop()
	log.Println("Servers stopped gracefully")
}
