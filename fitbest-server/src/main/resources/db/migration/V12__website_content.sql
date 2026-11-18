CREATE TABLE website_draft (
    id integer PRIMARY KEY CHECK (id = 1),
    revision bigint NOT NULL DEFAULT 1,
    content jsonb NOT NULL
);

CREATE TABLE website_publications (
    version bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    content jsonb NOT NULL,
    published_by uuid,
    published_at timestamp(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
    restored_from bigint REFERENCES website_publications(version)
);

INSERT INTO website_draft (id, content) VALUES (1, $content$
{
    "seoTitle": "FITBEST · 智能器械训练",
    "seoDescription": "FITBEST — 让每一台智能器械，都懂你的训练。",
    "heroHeadline": "让每一台智能器械",
    "heroEmphasis": "懂你的训练",
    "heroDescription": "从数据采集到 AI 私教，从力量插销到专项赛事 — FITBEST 把有氧、力量、赛事、AI 聚到一起。",
    "heroImage": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=440&auto=format&fit=crop&q=70",
    "heroImageAlt": "跑步机训练",
    "productTitle": "手机、网页与场馆大屏",
    "equipmentTitle": "有氧器械与力量训练",
    "equipmentDescription": "连接兼容的 FTMS 有氧器械和智能插销。力量记录与插销绑定保存在当前设备。",
    "trainingTitle": "选择你的训练项目",
    "treadmillTitle": "跑步机训练",
    "hyroxTitle": "HYROX 专项",
    "btweTitle": "BTWE 专项",
    "downloadTitle": "让训练从此不一样",
    "downloadDescription": "下载 FitBest 官方商店版，或直接打开网页版训练。",
    "storeApple": "https://apps.apple.com/cn/app/fitbest/id6448613913",
    "storeGoogle": "https://play.google.com/store/apps/details?id=com.fitbest.www",
    "webUrl": "/fitbest/",
    "hdUrl": "/fitbest-hd/",
    "treadmillUrl": "/fitbest/#/train/treadmill",
    "hyroxUrl": "/hyrox/#/train",
    "btweUrl": "/btwe/#/train",
    "supportEmail": "myfitbest2023@gmail.com"
}
$content$::jsonb);

INSERT INTO website_publications (content) SELECT content FROM website_draft WHERE id = 1;
