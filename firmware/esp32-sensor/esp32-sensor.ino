#include <WiFi.h>
#include <HTTPClient.h>
#include "secrets.h"   // WIFI_SSID, WIFI_PASSWORD, SERVER_IP, DEVICE_API_KEY

/* =========================================
   CONFIGURAÇÕES
   (Wi-Fi, IP do servidor e chave ficam em secrets.h)
   ========================================= */
const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;
const char* serverIP = SERVER_IP;
const int serverPort = 3000;
const int localId = 1;

/* =========================================
   HARDWARE E LÓGICA
   ========================================= */
// Pinos: Fundo (25%) -> Meio (50%) -> Alto (75%) -> Topo (100%)
const int pinosSensores[] = {27, 14, 12, 13}; 
const int niveisPorcento[] = {25, 50, 75, 100}; 
const int qtdSensores = 4;

// Se o envio falhar, tenta de novo depois deste intervalo
const unsigned long INTERVALO_RETENTATIVA = 5000;

// Variáveis de Estado
int nivelLatched = 0;         // Último nível VÁLIDO confirmado (Memória)
int ultimoNivelEnviado = -1;  // Último nível enviado COM SUCESSO ao servidor
unsigned long proximaTentativa = 0; // Quando podemos tentar enviar de novo

void setup() {
  Serial.begin(115200);
  Serial.println("\n--- INICIANDO SISTEMA DE MONITORAMENTO ---");

  // Configura Pinos
  for (int i = 0; i < qtdSensores; i++) {
    // Usando INPUT (Seu módulo joga sinal HIGH quando detecta)
    pinMode(pinosSensores[i], INPUT); 
  }

  // Conexão Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Conectando ao WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Conectado!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

void loop() {
  // Verifica conexão antes de tudo
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi caiu! Reconectando...");
    WiFi.disconnect();
    WiFi.reconnect();
    delay(1000);
    return;
  }

  // 1. VARREDURA INSTANTÂNEA
  int leituraDoMomento = 0; 

  for (int i = 0; i < qtdSensores; i++) {
    if (digitalRead(pinosSensores[i]) == HIGH) { 
      leituraDoMomento = niveisPorcento[i];
    }
  }

  // 2. MEMÓRIA DO ÚLTIMO NÍVEL VÁLIDO
  // Se a boia (ímã) está sobre algum sensor, guarda esse nível.
  // Se não está sobre nenhum (boia entre dois sensores), mantém o último valor.
  // Limitação conhecida: não existe estado "abaixo de 25%".
  if (leituraDoMomento != 0) {
    nivelLatched = leituraDoMomento;
  } 

  // 3. ENVIO (POST)
  // Só envia se o nível confirmado mudou desde o último envio BEM-SUCEDIDO.
  // Se falhar, tenta de novo a cada INTERVALO_RETENTATIVA.
  if (nivelLatched != 0 && nivelLatched != ultimoNivelEnviado && millis() >= proximaTentativa) {
    
    Serial.println("\n------------------------------------------------");
    Serial.print("🌊 MUDANÇA DE NÍVEL CONFIRMADA: ");
    Serial.print(nivelLatched);
    Serial.println("%");

    if (enviarDados(nivelLatched)) {
      ultimoNivelEnviado = nivelLatched; 
    } else {
      Serial.println("⚠️ Falha no envio, nova tentativa em instantes.");
      proximaTentativa = millis() + INTERVALO_RETENTATIVA;
    }
  }

  delay(100); // Loop rápido
}

// --- FUNÇÃO DE ENVIO HTTP ---
// Retorna true se o servidor respondeu com sucesso (2xx)
bool enviarDados(int nivel) {
  HTTPClient http;
  String url = "http://" + String(serverIP) + ":" + String(serverPort) + "/api/leituras";
  
  Serial.print("Enviando POST para: ");
  Serial.println(url);

  http.begin(url);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");
  if (strlen(DEVICE_API_KEY) > 0) {
    http.addHeader("x-api-key", DEVICE_API_KEY);
  }

  // JSON: { "nivel": 50, "local_id": 1 }
  String jsonPayload = "{\"nivel\": " + String(nivel) + ", \"local_id\": " + String(localId) + "}";
  
  int httpResponseCode = http.POST(jsonPayload);
  bool sucesso = (httpResponseCode >= 200 && httpResponseCode < 300);

  if (sucesso) {
    Serial.print("✅ SUCESSO! Resposta do Servidor: ");
    Serial.println(httpResponseCode);
    Serial.println(http.getString());
  } else {
    Serial.print("❌ ERRO NO ENVIO: ");
    Serial.println(httpResponseCode);
  }
  
  http.end();
  return sucesso;
}
