import type { EquipmentKind, MuscleGroup, StrengthExercise } from '../types'

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: '胸',
  back: '背',
  legs: '腿',
  glutes: '臀',
  shoulders: '肩',
  arms: '手臂',
  core: '核心',
}

export const EQUIPMENT_LABELS: Record<EquipmentKind, string> = {
  barbell: '杠铃',
  dumbbell: '哑铃',
  machine: '固定器械',
  cable: '绳索',
  bodyweight: '自重',
}

/** 全量力量动作库：覆盖七大肌群 × 五类器械 */
export const STRENGTH_EXERCISES: StrengthExercise[] = [
  // ===== 胸 =====
  { id: 'bench-press', name: '杠铃卧推', en: 'Barbell Bench Press', equipment: 'barbell', muscles: ['chest', 'arms'], step: 2.5, tip: '肩胛后收下沉，杠铃落在乳头连线' },
  { id: 'incline-bench', name: '上斜杠铃卧推', en: 'Incline Bench Press', equipment: 'barbell', muscles: ['chest', 'shoulders'], step: 2.5, tip: '凳面 30°，落点在锁骨下方' },
  { id: 'db-bench', name: '哑铃卧推', en: 'Dumbbell Bench Press', equipment: 'dumbbell', muscles: ['chest', 'arms'], step: 2, tip: '下放至胸侧，肘部约 45° 夹角' },
  { id: 'db-fly', name: '哑铃飞鸟', en: 'Dumbbell Fly', equipment: 'dumbbell', muscles: ['chest'], step: 2, tip: '肘微屈固定，用胸发力合拢' },
  { id: 'chest-press-machine', name: '坐姿推胸', en: 'Chest Press Machine', equipment: 'machine', muscles: ['chest', 'arms'], step: 5, tip: '握把与胸线齐平，不要耸肩' },
  { id: 'pec-deck', name: '蝴蝶机夹胸', en: 'Pec Deck', equipment: 'machine', muscles: ['chest'], step: 5, tip: '全程控制，末段停顿 1 秒' },
  { id: 'cable-crossover', name: '绳索夹胸', en: 'Cable Crossover', equipment: 'cable', muscles: ['chest'], step: 2.5, tip: '身体微前倾，双手在身前交叉' },
  { id: 'push-up', name: '俯卧撑', en: 'Push-up', equipment: 'bodyweight', muscles: ['chest', 'arms', 'core'], bodyweight: true, step: 2.5, tip: '身体成一条直线，胸部贴近地面' },

  // ===== 背 =====
  { id: 'deadlift', name: '硬拉', en: 'Deadlift', equipment: 'barbell', muscles: ['back', 'glutes', 'legs'], step: 5, tip: '杠铃贴腿，起身时髋膝同步伸展' },
  { id: 'barbell-row', name: '杠铃划船', en: 'Barbell Row', equipment: 'barbell', muscles: ['back', 'arms'], step: 2.5, tip: '髋部铰链保持 45°，拉向下腹' },
  { id: 'pull-up', name: '引体向上', en: 'Pull-up', equipment: 'bodyweight', muscles: ['back', 'arms'], bodyweight: true, step: 2.5, tip: '肩胛先下沉再屈肘，不要摆荡' },
  { id: 'lat-pulldown', name: '高位下拉', en: 'Lat Pulldown', equipment: 'machine', muscles: ['back', 'arms'], step: 5, tip: '拉至锁骨，避免身体后仰借力' },
  { id: 'seated-row', name: '坐姿划船', en: 'Seated Row', equipment: 'machine', muscles: ['back', 'arms'], step: 5, tip: '胸部挺起，肘部贴近身体后拉' },
  { id: 'db-row', name: '单臂哑铃划船', en: 'One-arm Dumbbell Row', equipment: 'dumbbell', muscles: ['back'], step: 2, tip: '拉至髋侧，避免躯干旋转' },
  { id: 'cable-row', name: '绳索坐姿划船', en: 'Cable Row', equipment: 'cable', muscles: ['back', 'arms'], step: 2.5, tip: '肩胛后收，回放时保持张力' },
  { id: 'face-pull', name: '绳索面拉', en: 'Face Pull', equipment: 'cable', muscles: ['back', 'shoulders'], step: 2.5, tip: '拉向面部，肘高于手腕' },

  // ===== 腿 / 臀 =====
  { id: 'back-squat', name: '杠铃深蹲', en: 'Back Squat', equipment: 'barbell', muscles: ['legs', 'glutes', 'core'], step: 5, tip: '下蹲至大腿平行，膝盖对齐脚尖' },
  { id: 'front-squat', name: '前蹲', en: 'Front Squat', equipment: 'barbell', muscles: ['legs', 'core'], step: 2.5, tip: '肘部抬高，躯干保持直立' },
  { id: 'romanian-deadlift', name: '罗马尼亚硬拉', en: 'Romanian Deadlift', equipment: 'barbell', muscles: ['glutes', 'legs'], step: 2.5, tip: '髋部后移，感受腘绳肌拉伸' },
  { id: 'leg-press', name: '腿举', en: 'Leg Press', equipment: 'machine', muscles: ['legs', 'glutes'], step: 10, tip: '下放至膝约 90°，不要锁死膝关节' },
  { id: 'leg-extension', name: '腿屈伸', en: 'Leg Extension', equipment: 'machine', muscles: ['legs'], step: 5, tip: '顶峰收缩停顿，回落缓慢' },
  { id: 'leg-curl', name: '腿弯举', en: 'Leg Curl', equipment: 'machine', muscles: ['legs'], step: 5, tip: '髋部贴紧垫面，不要抬臀' },
  { id: 'hip-thrust', name: '杠铃臀推', en: 'Barbell Hip Thrust', equipment: 'barbell', muscles: ['glutes', 'legs'], step: 5, tip: '顶峰时躯干与大腿成一条线' },
  { id: 'lunge', name: '哑铃箭步蹲', en: 'Dumbbell Lunge', equipment: 'dumbbell', muscles: ['legs', 'glutes'], step: 2, tip: '前膝不超过脚尖太多，后膝接近地面' },
  { id: 'calf-raise', name: '站姿提踵', en: 'Calf Raise', equipment: 'machine', muscles: ['legs'], step: 5, tip: '全幅度上下，顶端停 1 秒' },
  { id: 'goblet-squat', name: '哑铃高脚杯深蹲', en: 'Goblet Squat', equipment: 'dumbbell', muscles: ['legs', 'glutes'], step: 2, tip: '哑铃抱于胸前，肘部在大腿内侧' },
  { id: 'hip-abduction', name: '坐姿髋外展', en: 'Hip Abduction', equipment: 'machine', muscles: ['glutes'], step: 5, tip: '身体前倾，末端停顿收缩' },

  // ===== 肩 =====
  { id: 'ohp', name: '站姿杠铃推举', en: 'Overhead Press', equipment: 'barbell', muscles: ['shoulders', 'arms'], step: 2.5, tip: '核心收紧，杠铃过头后微前推' },
  { id: 'db-shoulder-press', name: '哑铃肩推', en: 'Dumbbell Shoulder Press', equipment: 'dumbbell', muscles: ['shoulders', 'arms'], step: 2, tip: '下放至耳朵高度，不要耸肩' },
  { id: 'lateral-raise', name: '哑铃侧平举', en: 'Lateral Raise', equipment: 'dumbbell', muscles: ['shoulders'], step: 1, tip: '小重量高次数，肘部引领' },
  { id: 'rear-delt-fly', name: '俯身反向飞鸟', en: 'Rear Delt Fly', equipment: 'dumbbell', muscles: ['shoulders', 'back'], step: 1, tip: '肩胛稳定，用后束带动' },
  { id: 'shoulder-press-machine', name: '坐姿推肩', en: 'Shoulder Press Machine', equipment: 'machine', muscles: ['shoulders', 'arms'], step: 5, tip: '下放至耳侧，推起时不要锁肘' },
  { id: 'cable-lateral', name: '绳索侧平举', en: 'Cable Lateral Raise', equipment: 'cable', muscles: ['shoulders'], step: 1, tip: '全程恒定张力，动作幅度优先' },

  // ===== 手臂 =====
  { id: 'barbell-curl', name: '杠铃弯举', en: 'Barbell Curl', equipment: 'barbell', muscles: ['arms'], step: 2.5, tip: '肘部固定在体侧，不要甩动' },
  { id: 'db-curl', name: '哑铃弯举', en: 'Dumbbell Curl', equipment: 'dumbbell', muscles: ['arms'], step: 1, tip: '顶峰旋后，离心缓慢' },
  { id: 'hammer-curl', name: '锤式弯举', en: 'Hammer Curl', equipment: 'dumbbell', muscles: ['arms'], step: 1, tip: '拇指朝上，练肱桡肌' },
  { id: 'preacher-curl', name: '器械弯举', en: 'Preacher Curl Machine', equipment: 'machine', muscles: ['arms'], step: 5, tip: '腋下贴紧斜板，避免借力' },
  { id: 'triceps-machine', name: '器械臂屈伸', en: 'Triceps Extension Machine', equipment: 'machine', muscles: ['arms'], step: 5, tip: '肘部固定在转轴，回落控制' },
  { id: 'tricep-pushdown', name: '绳索下压', en: 'Triceps Pushdown', equipment: 'cable', muscles: ['arms'], step: 2.5, tip: '大臂夹紧，只有小臂运动' },
  { id: 'skull-crusher', name: '杠铃臂屈伸', en: 'Skull Crusher', equipment: 'barbell', muscles: ['arms'], step: 2.5, tip: '肘部固定，杠铃落向额头上方' },
  { id: 'dip', name: '双杠臂屈伸', en: 'Dip', equipment: 'bodyweight', muscles: ['arms', 'chest'], bodyweight: true, step: 2.5, tip: '躯干直立偏肱三头，前倾偏胸' },
  { id: 'cable-curl', name: '绳索弯举', en: 'Cable Curl', equipment: 'cable', muscles: ['arms'], step: 2.5, tip: '全程张力，底部不完全放松' },

  // ===== 核心 =====
  { id: 'plank', name: '平板支撑', en: 'Plank', equipment: 'bodyweight', muscles: ['core'], bodyweight: true, step: 0, tip: '以秒计时，臀部不要下沉' },
  { id: 'hanging-leg-raise', name: '悬垂举腿', en: 'Hanging Leg Raise', equipment: 'bodyweight', muscles: ['core'], bodyweight: true, step: 0, tip: '骨盆后倾，用下腹发力' },
  { id: 'cable-crunch', name: '绳索卷腹', en: 'Cable Crunch', equipment: 'cable', muscles: ['core'], step: 2.5, tip: '脊柱逐节屈曲，不要用髋部下拉' },
  { id: 'ab-machine', name: '坐姿卷腹', en: 'Ab Crunch Machine', equipment: 'machine', muscles: ['core'], step: 5, tip: '呼气收腹，回落控制' },
  { id: 'russian-twist', name: '俄罗斯转体', en: 'Russian Twist', equipment: 'bodyweight', muscles: ['core'], bodyweight: true, step: 2.5, tip: '转动来自胸椎，不是手臂' },
]

export const EXERCISE_MAP: Record<string, StrengthExercise> = STRENGTH_EXERCISES.reduce(
  (acc, e) => {
    acc[e.id] = e
    return acc
  },
  {} as Record<string, StrengthExercise>,
)
