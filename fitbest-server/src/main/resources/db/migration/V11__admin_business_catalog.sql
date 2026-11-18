CREATE TABLE machine_type_dictionary (
    code "MachineType" PRIMARY KEY,
    label varchar(80) NOT NULL,
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    selectable boolean NOT NULL DEFAULT true
);

INSERT INTO machine_type_dictionary (code, label, sort_order) VALUES
    ('treadmill', '跑步机', 10), ('rower', '划船机', 20), ('ski', '滑雪机', 30),
    ('bike', '风阻车', 40), ('sled', '雪橇机', 50), ('rep', '力量训练', 60),
    ('spin', '动感单车', 70), ('elliptical', '椭圆机', 80), ('upright', '健身车', 90), ('stair', '楼梯机', 100);

CREATE TABLE admin_business_settings (
    id integer PRIMARY KEY CHECK (id = 1),
    default_gym_timezone varchar(80) NOT NULL
);

INSERT INTO admin_business_settings VALUES (1, 'Asia/Shanghai');
