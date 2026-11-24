CREATE TABLE machine_navigation (
    id integer PRIMARY KEY CHECK (id = 1),
    config jsonb NOT NULL
);

-- Initial navigation uses the existing App order and translations. Only the two
-- sample broadcast names in #9 are seeded until the legacy config is verified.
INSERT INTO machine_navigation (id, config) VALUES (1, $config$
{
  "machineTypes": [
    {"code":"treadmill","names":{"zh-CN":"跑步机","en":"Treadmill","ja":"トレッドミル","ko":"러닝머신","es":"Cinta de correr","de":"Laufband","fr":"Tapis de course"},"sortOrder":10,"visible":true},
    {"code":"rower","names":{"zh-CN":"划船机","en":"Rower","ja":"ローイングマシン","ko":"로잉머신","es":"Remo","de":"Rudergerät","fr":"Rameur"},"sortOrder":20,"visible":true},
    {"code":"ski","names":{"zh-CN":"滑雪机","en":"Ski Erg","ja":"スキーマシン","ko":"스키에르그","es":"Máquina de esquí","de":"Skiergometer","fr":"Ski erg"},"sortOrder":30,"visible":true},
    {"code":"bike","names":{"zh-CN":"风阻单车","en":"Air Bike","ja":"エアバイク","ko":"에어 바이크","es":"Bicicleta de aire","de":"Airbike","fr":"Vélo à air"},"sortOrder":40,"visible":true},
    {"code":"spin","names":{"zh-CN":"动感单车","en":"Indoor Cycling Bike","ja":"スピンバイク","ko":"스피닝 바이크","es":"Bicicleta de spinning","de":"Indoorbike","fr":"Vélo de biking"},"sortOrder":50,"visible":true},
    {"code":"elliptical","names":{"zh-CN":"椭圆机","en":"Elliptical","ja":"エリプティカル","ko":"일립티컬","es":"Elíptica","de":"Crosstrainer","fr":"Vélo elliptique"},"sortOrder":60,"visible":true},
    {"code":"upright","names":{"zh-CN":"健身车","en":"Exercise Bike","ja":"エクササイズバイク","ko":"헬스 바이크","es":"Bicicleta estática","de":"Heimtrainer","fr":"Vélo d’exercice"},"sortOrder":70,"visible":true},
    {"code":"stair","names":{"zh-CN":"楼梯机","en":"Stair Climber","ja":"ステアクライマー","ko":"스텝밀","es":"Escaladora","de":"Treppensteiger","fr":"Escalier de musculation"},"sortOrder":80,"visible":true}
  ],
  "bleRules": [
    {"id":"cc650771-826f-4650-8b37-b67b8efe69a2","machineType":"treadmill","match":"exact","patterns":["YJ01-S7Pro-000007"],"preferredProtocol":"PRIVATE","priority":10,"enabled":true},
    {"id":"ce079e6b-3196-4af6-abd1-94b5deadd532","machineType":"ski","match":"exact","patterns":["Kpower-00028"],"preferredProtocol":"FTMS","priority":20,"enabled":true}
  ],
  "resistanceDisabledPatterns": []
}
$config$::jsonb);
