# 构建阶段
FROM golang:1.24-bullseye AS builder

# 设置中国地区的GOPROXY
RUN go env -w GOPROXY=https://goproxy.cn,direct

WORKDIR /app
COPY . .

# 安装依赖并构建
RUN go mod download \
    && CGO_ENABLED=0 GOOS=linux go build -o webrtc-server ./cmd/server

# 运行阶段 - 使用优化后的基础镜像
FROM debian:bullseye-slim

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 使用阿里云镜像源
RUN echo "deb http://mirrors.aliyun.com/debian/ bullseye main non-free contrib" > /etc/apt/sources.list && \
    echo "deb http://mirrors.aliyun.com/debian/ bullseye-updates main non-free contrib" >> /etc/apt/sources.list && \
    echo "deb http://mirrors.aliyun.com/debian-security bullseye-security main" >> /etc/apt/sources.list

# 安装必要依赖（优化版）
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/webrtc-server .
COPY --from=builder /app/static ./static
COPY --from=builder /app/config ./config

EXPOSE 8080 3478/udp
CMD ["./webrtc-server", "-config", "/app/config/config.yaml"]
