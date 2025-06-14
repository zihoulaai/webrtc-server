package webrtcutil

import (
	"fmt"
	"github.com/spf13/viper"
	"net"
)

type Config struct {
	Server struct {
		HTTPPort string `yaml:"http_port"`
	} `yaml:"server"`
	Turn struct {
		Address  string `yaml:"address"`
		Realm    string `yaml:"realm"`
		Username string `yaml:"username"`
		Password string `yaml:"password"`
		PublicIP string `yaml:"public_ip"`
	} `yaml:"turn"`
}

var config Config

func LoadConfig(file string) error {
	viper.SetConfigFile(file)
	if err := viper.ReadInConfig(); err != nil {
		return fmt.Errorf("failed to read config: %w", err)
	}

	if err := viper.Unmarshal(&config); err != nil {
		return fmt.Errorf("failed to unmarshal config: %w", err)
	}

	// 自动检测公网IP
	if config.Turn.PublicIP == "" {
		ip, err := getPublicIP()
		if err != nil {
			return fmt.Errorf("failed to get public IP: %w", err)
		}
		config.Turn.PublicIP = ip
	}

	return nil
}

func GetConfig() Config {
	return config
}

func getPublicIP() (string, error) {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "", err
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String(), nil
}
