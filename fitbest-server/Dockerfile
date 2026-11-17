# FITBEST 统一服务镜像
# 构建层用 JDK21 编译（字节码目标 17），运行层 JRE21 启用虚拟线程
# 基础镜像走 DaoCloud 镜像源（国内服务器 Docker Hub 直连受限；如环境可达可换回官方前缀）
ARG MAVEN_IMAGE=docker.m.daocloud.io/library/maven:3.9-eclipse-temurin-21
ARG JAVA_IMAGE=docker.m.daocloud.io/library/eclipse-temurin:21-jre
FROM ${MAVEN_IMAGE} AS builder
WORKDIR /app
# 使用镜像下载依赖，只解析打包需要的依赖和插件。
ARG MAVEN_MIRROR_URL=https://maven.aliyun.com/repository/public
RUN mkdir -p /root/.m2 && printf '<settings><mirrors><mirror><id>fitbest-mirror</id><mirrorOf>*</mirrorOf><url>%s</url></mirror></mirrors></settings>\n' "$MAVEN_MIRROR_URL" > /root/.m2/settings.xml
COPY pom.xml .
COPY src ./src
RUN --mount=type=cache,target=/root/.m2/repository mvn -B -Dmaven.test.skip=true package

FROM ${JAVA_IMAGE}
WORKDIR /app
# healthcheck 依赖 curl
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system fitbest && adduser --system --ingroup fitbest fitbest
COPY --from=builder /app/target/fitbest-server-*.jar app.jar
USER fitbest
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
