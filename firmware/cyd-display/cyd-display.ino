#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <lvgl.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include <SPI.h>
#include "secrets.h"   // WIFI_SSID, WIFI_PASSWORD, SERVER_IP

/* =========================================
   CONFIGURAÇÕES
   ========================================= */
const char* ssid = WIFI_SSID;
const char* password = WIFI_PASSWORD;
const char* serverIP = SERVER_IP;
const int serverPort = 3000;
const int localId = 1;

/* =========================================
   HARDWARE
   ========================================= */
#define XPT2046_IRQ 36
#define XPT2046_MOSI 32
#define XPT2046_MISO 39
#define XPT2046_CLK 25
#define XPT2046_CS 33
#define TFT_BL 21

SPIClass mySpi(VSPI);
XPT2046_Touchscreen ts(XPT2046_CS, XPT2046_IRQ);
TFT_eSPI tft = TFT_eSPI(); 

static lv_disp_draw_buf_t draw_buf;
static lv_color_t buf[320 * 10]; 

// Objetos UI
lv_obj_t * ui_Screen;
lv_obj_t * ui_ArcGauge;
lv_obj_t * ui_LabelPercent;
lv_obj_t * ui_LabelStatus; 
lv_obj_t * ui_LabelLocal;
lv_obj_t * ui_LabelData;

// Objetos Modal
lv_obj_t * ui_ModalPanel;
lv_obj_t * ui_ModalTitle;
lv_obj_t * ui_ModalContent; // Texto (para Alertas/Info)
lv_obj_t * ui_Calendar;     // Calendário (para Histórico)
lv_obj_t * ui_BtnClose;

String textoAlertas = "Sem dados...";

/* =========================================
   DRIVERS
   ========================================= */
void my_touchpad_read(lv_indev_drv_t * indev_driver, lv_indev_data_t * data) {
  if (ts.touched()) {
    TS_Point p = ts.getPoint();
    // SUA CALIBRAÇÃO:
    int x = map(p.x, 186, 3715, 0, 320); 
    int y = map(p.y, 275, 3810, 0, 240);
    
    if(x<0) x=0; if(x>320) x=320;
    if(y<0) y=0; if(y>240) y=240;

    data->point.x = x;
    data->point.y = y;
    data->state = LV_INDEV_STATE_PR;
  } else {
    data->state = LV_INDEV_STATE_REL;
  }
}

void my_disp_flush(lv_disp_drv_t *disp, const lv_area_t *area, lv_color_t *color_p) {
  uint32_t w = (area->x2 - area->x1 + 1);
  uint32_t h = (area->y2 - area->y1 + 1);
  tft.startWrite();
  tft.setAddrWindow(area->x1, area->y1, w, h);
  tft.pushColors((uint16_t *)&color_p->full, w * h, true);
  tft.endWrite();
  lv_disp_flush_ready(disp);
}

/* =========================================
   LÓGICA UI
   ========================================= */

// Função unificada para abrir modal
// tipo: 1=Texto, 2=Calendario
void abrirModal(String titulo, String conteudo, int tipo) {
    lv_label_set_text(ui_ModalTitle, titulo.c_str());
    
    if (tipo == 1) {
        // Modo Texto
        lv_obj_clear_flag(ui_ModalContent, LV_OBJ_FLAG_HIDDEN);
        lv_obj_add_flag(ui_Calendar, LV_OBJ_FLAG_HIDDEN);
        lv_label_set_text(ui_ModalContent, conteudo.c_str());
    } else {
        // Modo Calendário
        lv_obj_add_flag(ui_ModalContent, LV_OBJ_FLAG_HIDDEN);
        lv_obj_clear_flag(ui_Calendar, LV_OBJ_FLAG_HIDDEN);
    }

    lv_obj_clear_flag(ui_ModalPanel, LV_OBJ_FLAG_HIDDEN);
    lv_obj_move_foreground(ui_ModalPanel);
}

static void btn_event_cb(lv_event_t * e) {
    lv_event_code_t code = lv_event_get_code(e);
    if(code == LV_EVENT_CLICKED) {
        int btnId = (int)(long)lv_event_get_user_data(e);

        if (btnId == 1) {
            // Histórico -> Abre Calendário
            abrirModal("Historico", "", 2); 
        }
        else if (btnId == 2) {
            // Alertas -> Abre Texto
            abrirModal("Alertas", textoAlertas, 1);
        }
        else if (btnId == 3) {
             // Info -> Abre Texto
             String info = "IP: " + WiFi.localIP().toString() + "\nServer: " + String(serverIP) + "\nSinal: " + String(WiFi.RSSI()) + "dBm";
             abrirModal("Info Tecnica", info, 1);
        }
        else if (btnId == 99) {
            lv_obj_add_flag(ui_ModalPanel, LV_OBJ_FLAG_HIDDEN);
        }
    }
}

// Callback do Calendário (Apenas cosmético por enquanto)
static void calendar_event_handler(lv_event_t * e) {
    lv_event_code_t code = lv_event_get_code(e);
    lv_obj_t * obj = lv_event_get_current_target(e);
    
    if(code == LV_EVENT_VALUE_CHANGED) {
        lv_calendar_date_t date;
        if(lv_calendar_get_pressed_date(obj, &date)) {
            Serial.printf("Data clicada: %02d/%02d/%d\n", date.day, date.month, date.year);
            
            // 1. Abre o modal imediatamente com "Carregando..." para dar feedback visual
            String msgCarregando = "Buscando dados de:\n" + String(date.day) + "/" + String(date.month) + "/" + String(date.year) + "\n\nAguarde...";
            abrirModal("Detalhes do Dia", msgCarregando, 1); // Tipo 1 = Texto
            
            // 2. Chama a função que vai no servidor buscar os dados reais
            // Pequeno delay para a interface desenhar o modal antes de travar no HTTP
            // (Num sistema RTOS ideal faríamos em outra task, mas aqui faremos direto)
            buscarDadosPorData(date.year, date.month, date.day);
        }
    }
}

void criarEstiloBotao(lv_obj_t * btn) {
    lv_obj_set_style_bg_color(btn, lv_color_hex(0x5B6E96), LV_PART_MAIN);
    lv_obj_set_style_radius(btn, 8, LV_PART_MAIN);
    lv_obj_set_width(btn, 90); lv_obj_set_height(btn, 40);
}

void criarInterface() {
  ui_Screen = lv_scr_act();
  lv_obj_set_style_bg_color(ui_Screen, lv_color_hex(0xF0F2F5), LV_PART_MAIN);

  // --- Painel Base ---
  lv_obj_t * panel = lv_obj_create(ui_Screen);
  lv_obj_set_size(panel, 310, 160);
  lv_obj_align(panel, LV_ALIGN_TOP_MID, 0, 5); 
  lv_obj_set_style_bg_color(panel, lv_color_hex(0xFFFFFF), LV_PART_MAIN);
  lv_obj_clear_flag(panel, LV_OBJ_FLAG_SCROLLABLE);

  ui_ArcGauge = lv_arc_create(panel);
  lv_obj_set_size(ui_ArcGauge, 130, 130);
  lv_obj_align(ui_ArcGauge, LV_ALIGN_LEFT_MID, 5, 0);
  lv_arc_set_rotation(ui_ArcGauge, 270);
  lv_arc_set_bg_angles(ui_ArcGauge, 0, 360);
  lv_arc_set_angles(ui_ArcGauge, 0, 0);
  lv_obj_remove_style(ui_ArcGauge, NULL, LV_PART_KNOB);
  lv_obj_clear_flag(ui_ArcGauge, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_style_arc_width(ui_ArcGauge, 18, LV_PART_MAIN);
  lv_obj_set_style_arc_width(ui_ArcGauge, 18, LV_PART_INDICATOR);

  ui_LabelPercent = lv_label_create(ui_ArcGauge);
  lv_label_set_text(ui_LabelPercent, "--%");
  lv_obj_set_style_text_font(ui_LabelPercent, &lv_font_montserrat_22, 0);
  lv_obj_center(ui_LabelPercent);

  ui_LabelLocal = lv_label_create(panel);
  lv_label_set_text(ui_LabelLocal, "Local: --");
  lv_obj_set_width(ui_LabelLocal, 140); 
  lv_label_set_long_mode(ui_LabelLocal, LV_LABEL_LONG_WRAP); 
  lv_obj_align(ui_LabelLocal, LV_ALIGN_TOP_RIGHT, 0, 5);
  lv_obj_set_style_text_align(ui_LabelLocal, LV_TEXT_ALIGN_RIGHT, 0);

  ui_LabelStatus = lv_label_create(panel);
  lv_label_set_text(ui_LabelStatus, "Iniciando...");
  lv_obj_set_style_text_font(ui_LabelStatus, &lv_font_montserrat_14, 0);
  lv_obj_align(ui_LabelStatus, LV_ALIGN_RIGHT_MID, 0, -10);

  ui_LabelData = lv_label_create(panel);
  lv_label_set_text(ui_LabelData, "--/-- --:--");
  lv_obj_set_style_text_font(ui_LabelData, &lv_font_montserrat_10, 0);
  lv_obj_align(ui_LabelData, LV_ALIGN_BOTTOM_RIGHT, 0, 0);

  // --- Botões ---
  lv_obj_t * contBtn = lv_obj_create(ui_Screen);
  lv_obj_set_size(contBtn, 320, 60);
  lv_obj_align(contBtn, LV_ALIGN_BOTTOM_MID, 0, 0);
  lv_obj_set_style_bg_opa(contBtn, 0, 0);
  lv_obj_set_style_border_width(contBtn, 0, 0);
  lv_obj_set_flex_flow(contBtn, LV_FLEX_FLOW_ROW);
  lv_obj_set_flex_align(contBtn, LV_FLEX_ALIGN_SPACE_EVENLY, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);

  lv_obj_t * b1 = lv_btn_create(contBtn); criarEstiloBotao(b1);
  lv_obj_add_event_cb(b1, btn_event_cb, LV_EVENT_CLICKED, (void*)1);
  lv_obj_t * l1 = lv_label_create(b1); lv_label_set_text(l1, "Hist."); lv_obj_center(l1);

  lv_obj_t * b2 = lv_btn_create(contBtn); criarEstiloBotao(b2);
  lv_obj_add_event_cb(b2, btn_event_cb, LV_EVENT_CLICKED, (void*)2);
  lv_obj_t * l2 = lv_label_create(b2); lv_label_set_text(l2, "Alertas"); lv_obj_center(l2);

  lv_obj_t * b3 = lv_btn_create(contBtn); criarEstiloBotao(b3);
  lv_obj_add_event_cb(b3, btn_event_cb, LV_EVENT_CLICKED, (void*)3);
  lv_obj_t * l3 = lv_label_create(b3); lv_label_set_text(l3, "Info"); lv_obj_center(l3);

  // --- MODAL ---
  ui_ModalPanel = lv_obj_create(ui_Screen);
  lv_obj_set_size(ui_ModalPanel, 280, 220); // Um pouco maior pro calendario
  lv_obj_center(ui_ModalPanel);
  lv_obj_set_style_bg_color(ui_ModalPanel, lv_color_hex(0xFFFFFF), LV_PART_MAIN);
  lv_obj_set_style_border_color(ui_ModalPanel, lv_color_hex(0x5B6E96), LV_PART_MAIN);
  lv_obj_set_style_border_width(ui_ModalPanel, 2, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(ui_ModalPanel, 50, LV_PART_MAIN);
  lv_obj_add_flag(ui_ModalPanel, LV_OBJ_FLAG_HIDDEN);

  ui_ModalTitle = lv_label_create(ui_ModalPanel);
  lv_label_set_text(ui_ModalTitle, "Titulo");
  lv_obj_set_style_text_font(ui_ModalTitle, &lv_font_montserrat_16, 0);
  lv_obj_set_style_text_color(ui_ModalTitle, lv_color_hex(0x5B6E96), 0);
  lv_obj_align(ui_ModalTitle, LV_ALIGN_TOP_LEFT, 0, 0);

  // Conteúdo Texto
  ui_ModalContent = lv_label_create(ui_ModalPanel);
  lv_label_set_text(ui_ModalContent, "Conteudo...");
  lv_label_set_long_mode(ui_ModalContent, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(ui_ModalContent, 240);
  lv_obj_align(ui_ModalContent, LV_ALIGN_TOP_LEFT, 0, 30);

  // Conteúdo Calendário (Novo!)
  ui_Calendar = lv_calendar_create(ui_ModalPanel);
  lv_obj_set_size(ui_Calendar, 230, 150); // Tamanho compacto
  lv_obj_align(ui_Calendar, LV_ALIGN_TOP_MID, 0, 25);
  lv_obj_add_event_cb(ui_Calendar, calendar_event_handler, LV_EVENT_ALL, NULL);
  
  // Ativa o Header com setas (precisa do lv_conf.h habilitado)
  lv_calendar_header_arrow_create(ui_Calendar);
  
  lv_obj_add_flag(ui_Calendar, LV_OBJ_FLAG_HIDDEN); // Escondido por padrão

  // Botão Fechar
  ui_BtnClose = lv_btn_create(ui_ModalPanel);
  lv_obj_set_size(ui_BtnClose, 80, 30);
  lv_obj_align(ui_BtnClose, LV_ALIGN_BOTTOM_RIGHT, 0, 0);
  lv_obj_set_style_bg_color(ui_BtnClose, lv_color_hex(0xE53935), 0);
  lv_obj_add_event_cb(ui_BtnClose, btn_event_cb, LV_EVENT_CLICKED, (void*)99);
  lv_obj_t * lblClose = lv_label_create(ui_BtnClose);
  lv_label_set_text(lblClose, "Fechar");
  lv_obj_center(lblClose);
}

// Função para buscar detalhes de UM dia específico
void buscarDadosPorData(int ano, int mes, int dia) {
  if(WiFi.status() != WL_CONNECTED) {
      abrirModal("Erro", "Sem conexao WiFi", 1);
      return;
  }

  HTTPClient http;
  // Formata a data para YYYY-MM-DD
  char dataStr[12];
  sprintf(dataStr, "%04d-%02d-%02d", ano, mes, dia);
  
  String url = "http://" + String(serverIP) + ":" + String(serverPort) + "/api/leituras/" + String(dataStr);
  Serial.println("Buscando detalhes: " + url);
  
  http.begin(url);
  int httpCode = http.GET();

  if (httpCode > 0) {
    String payload = http.getString();
    // Buffer menor pois é só um dia
    DynamicJsonDocument doc(2048); 
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      int maximo = doc["maximo"];
      JsonArray leituras = doc["leituras"];
      
      String detalhe = "Data: " + String(dia) + "/" + String(mes) + "/" + String(ano) + "\n";
      
      if (leituras.size() > 0) {
        // Pega o status do PICO do dia (o maior valor)
        String statusText = "Seguro";
        if(maximo >= 75) statusText = "RISCO!";
        else if(maximo >= 50) statusText = "Moderado";
        
        detalhe += "Local: Tanque Principal\n";
        detalhe += "Maximo: " + String(maximo) + "%\n";
        detalhe += "Status: " + statusText + "\n";
        
        // Pega a hora do pico (procura qual leitura teve o valor maximo)
        String horaPico = "--:--";
        for(JsonObject l : leituras) {
            if((int)l["nivel"] == maximo) {
                horaPico = String((const char*)l["hora"]).substring(0,5);
                break;
            }
        }
        detalhe += "Hora Pico: " + horaPico;
        
      } else {
        detalhe += "\nNenhum registro\nnesta data.";
      }
      
      // Atualiza o modal que já está aberto com o texto novo
      lv_label_set_text(ui_ModalContent, detalhe.c_str());
      
    } else {
      lv_label_set_text(ui_ModalContent, "Erro ao ler JSON");
    }
  } else {
    lv_label_set_text(ui_ModalContent, "Erro HTTP buscar dia");
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH);

// 1. INICIA DISPLAY PRIMEIRO (Deixe ele fazer a bagunça dele)
tft.begin();
tft.setRotation(1); 

// 2. AGORA SIM, INICIA O TOUCH (Configura o VSPI por último e assume o controle)
mySpi.begin(XPT2046_CLK, XPT2046_MISO, XPT2046_MOSI, XPT2046_CS);
ts.begin(mySpi);
ts.setRotation(1);

  lv_init();
  lv_disp_draw_buf_init(&draw_buf, buf, NULL, 320 * 10);
  static lv_disp_drv_t disp_drv;
  lv_disp_drv_init(&disp_drv);
  disp_drv.hor_res = 320; disp_drv.ver_res = 240;
  disp_drv.flush_cb = my_disp_flush;
  disp_drv.draw_buf = &draw_buf;
  lv_disp_drv_register(&disp_drv);
  
  static lv_indev_drv_t indev_drv;
  lv_indev_drv_init(&indev_drv);
  indev_drv.type = LV_INDEV_TYPE_POINTER;
  indev_drv.read_cb = my_touchpad_read;
  lv_indev_drv_register(&indev_drv);

  criarInterface();
  
  WiFi.begin(ssid, password);
}

unsigned long lastCheck = 0;
bool wifiConnectedOnce = false;

void loop() {
  lv_timer_handler(); 
  delay(5);

  if (millis() - lastCheck > 5000) {
    if(WiFi.status() == WL_CONNECTED) {
       if(!wifiConnectedOnce) {
         lv_label_set_text(ui_LabelStatus, "Wi-Fi OK!");
         wifiConnectedOnce = true;
       }
       buscarDadosAPI();
    } else {
       lv_label_set_text(ui_LabelStatus, "Sem Wi-Fi");
    }
    lastCheck = millis();
  }
}

void buscarDadosAPI() {
  HTTPClient http;
  String url = "http://" + String(serverIP) + ":" + String(serverPort) + "/api/leituras?local_id=" + String(localId);
  http.begin(url);
  int httpCode = http.GET();
  
  if (httpCode > 0) {
    String payload = http.getString();
    DynamicJsonDocument doc(8192); 
    deserializeJson(doc, payload);
    JsonArray leituras = doc["leituras"];

    if (leituras.size() > 0) {
      int nivel = leituras[0]["nivel"];
      String local = leituras[0]["localidade"];
      String dataStr = leituras[0]["data"]; // YYYY-MM-DD
      String hora = leituras[0]["hora"];
      String dataCurta = dataStr; 
      if(dataStr.length() >= 10) dataCurta = dataStr.substring(8, 10) + "/" + dataStr.substring(5, 7);

      // Gauge e Texto
      int angulo = map(nivel, 0, 100, 0, 360);
      lv_arc_set_value(ui_ArcGauge, angulo);
      lv_label_set_text_fmt(ui_LabelPercent, "%d%%", nivel);

      // Cores
      if(nivel < 50) {
        lv_obj_set_style_arc_color(ui_ArcGauge, lv_color_hex(0x4CAF50), LV_PART_INDICATOR);
        lv_label_set_text(ui_LabelStatus, "Seguro");
        lv_obj_set_style_text_color(ui_LabelStatus, lv_color_hex(0x4CAF50), 0);
        textoAlertas = "Nivel Normal.\n\nSem risco de enchente.";
      }
      else if(nivel < 75) {
        lv_obj_set_style_arc_color(ui_ArcGauge, lv_color_hex(0xFFB300), LV_PART_INDICATOR);
        lv_label_set_text(ui_LabelStatus, "Moderado");
        lv_obj_set_style_text_color(ui_LabelStatus, lv_color_hex(0xFFB300), 0);
        textoAlertas = "ATENCAO!\n\nNivel moderado. O rio esta subindo.";
      }
      else {
        lv_obj_set_style_arc_color(ui_ArcGauge, lv_color_hex(0xE53935), LV_PART_INDICATOR);
        lv_label_set_text(ui_LabelStatus, "RISCO!");
        lv_obj_set_style_text_color(ui_LabelStatus, lv_color_hex(0xE53935), 0);
        textoAlertas = "ALERTA VERMELHO!\n\nRisco iminente de enchente.";
      }

      lv_label_set_text(ui_LabelLocal, local.c_str());
      lv_label_set_text_fmt(ui_LabelData, "%s %s", dataCurta.c_str(), hora.c_str());

      // --- ATUALIZA CALENDÁRIO COM A DATA DA LEITURA ---
      // dataStr vem como "2025-11-27"
      int ano = dataStr.substring(0, 4).toInt();
      int mes = dataStr.substring(5, 7).toInt();
      int dia = dataStr.substring(8, 10).toInt();

      lv_calendar_set_today_date(ui_Calendar, ano, mes, dia);
      lv_calendar_set_showed_date(ui_Calendar, ano, mes);
      
      // Marca o dia atual com uma bolinha
      static lv_calendar_date_t highlighted_days[1];
      highlighted_days[0].year = ano;
      highlighted_days[0].month = mes;
      highlighted_days[0].day = dia;
      lv_calendar_set_highlighted_dates(ui_Calendar, highlighted_days, 1);

    }
  }
  http.end();
}