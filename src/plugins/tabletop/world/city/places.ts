// Landmarks of 澜江市, at Shanghai's size (see geo.ts). Everyday places (homes, shops, small
// restaurants) are added around these; the story can register more.

import type { LonLat } from './geo.ts';

export type PlaceKind =
    | 'residence' | 'office' | 'industry' | 'mall' | 'market' | 'food' | 'cafe' | 'bar' | 'park' | 'sight'
    | 'fun' | 'school' | 'hospital' | 'police' | 'government' | 'station' | 'airport' | 'hotel';

export const KIND_LABEL: Record<PlaceKind, string> = {
    residence: '住宅', office: '写字楼', industry: '工业区', mall: '商业', market: '菜市场', food: '餐馆', cafe: '咖啡馆',
    bar: '酒吧', park: '公园', sight: '景点', fun: '娱乐', school: '学校', hospital: '医院', police: '派出所',
    government: '政府机关', station: '车站', airport: '机场', hotel: '酒店',
};

export interface PlaceShape {
    name: string;
    kind: PlaceKind;
    at: LonLat;
    /** Opening hours, e.g. 10:00–22:00; 全天 when always open; 工作日 09:00–17:00 for weekdays only. */
    hours: string;
    about: string;
}

export const LANDMARKS: PlaceShape[] = [
    // 中城区
    { name: '江滩', kind: 'sight', at: [121.4905, 31.239], hours: '全天', about: '澜江西岸一公里长的江堤，背后是一排上百年的老建筑，对岸就是望江嘴。' },
    { name: '市民广场', kind: 'park', at: [121.475, 31.2325], hours: '全天', about: '城市正中的广场，周围有博物馆、大剧院和市政府。' },
    { name: '长街', kind: 'mall', at: [121.4835, 31.2375], hours: '10:00–22:00', about: '从市民广场通到江滩的步行街，老字号和大商场挨在一起。' },
    { name: '老城厢', kind: 'sight', at: [121.492, 31.2265], hours: '09:00–21:00', about: '老城厢和城隍庙：老街、茶楼、小吃，过年有庙会。' },
    { name: '桂里', kind: 'bar', at: [121.4755, 31.2195], hours: '11:00–02:00', about: '石库门老房子改成的餐厅、酒吧和小店，晚上很热闹。' },
    { name: '澜江市政府', kind: 'government', at: [121.4735, 31.2305], hours: '工作日 09:00–17:00', about: '市政府大楼，在市民广场北侧。' },
    { name: '澜江市公安局', kind: 'police', at: [121.4805, 31.2355], hours: '全天', about: '市公安局，报案、户籍和出入境都在这里办。' },
    { name: '中城医院', kind: 'hospital', at: [121.466, 31.2125], hours: '全天', about: '老牌三甲医院，急诊全天开着，门诊人很多。' },
    { name: '江滩轮渡站', kind: 'station', at: [121.4945, 31.2335], hours: '06:00–22:00', about: '过江轮渡，十几分钟一班，到对岸望江嘴。' },
    // 安华区
    { name: '安华寺', kind: 'sight', at: [121.446, 31.2235], hours: '07:30–17:00', about: '闹市里的千年古寺，金色的屋顶，香火很旺。' },
    { name: '安华路', kind: 'mall', at: [121.4545, 31.2285], hours: '10:00–22:00', about: '高档商场和写字楼集中的一条街。' },
    { name: '澜江站', kind: 'station', at: [121.455, 31.2495], hours: '全天', about: '普速火车站，周围是老城北的居住区和小旅馆。' },
    { name: '安华北公园', kind: 'park', at: [121.455, 31.2825], hours: '06:00–18:00', about: '老城北的大公园，周围是大型社区和商场。' },
    { name: '鹿鸣路洋房', kind: 'residence', at: [121.4355, 31.2215], hours: '全天', about: '一条街的老洋房，住的多是老住户和有钱的租客。' },
    // 梧桐区
    { name: '衡梧路', kind: 'cafe', at: [121.447, 31.2055], hours: '08:00–23:00', about: '梧桐树下的老洋房街区，小咖啡馆、小酒馆和买手店。' },
    { name: '徐坊', kind: 'mall', at: [121.437, 31.1955], hours: '10:00–22:00', about: '几座大商场围着的十字路口，电脑城和电影院都在这里。' },
    { name: '澜江理工大学（徐坊校区）', kind: 'school', at: [121.4365, 31.2015], hours: '全天', about: '百年老校的老校区，红砖楼和草坪。' },
    { name: '梧桐医院', kind: 'hospital', at: [121.4525, 31.1985], hours: '全天', about: '综合医院，心内科和肿瘤科有名。' },
    { name: '滨江艺术区', kind: 'sight', at: [121.4635, 31.18], hours: '10:00–18:00', about: '江边的旧码头和仓库改成的美术馆、剧场和草坪。' },
    { name: '塔园', kind: 'sight', at: [121.452, 31.1745], hours: '07:00–17:00', about: '古塔和寺庙，春天有桃花。' },
    { name: '市体育馆', kind: 'fun', at: [121.4375, 31.1835], hours: '09:00–21:00', about: '圆顶的体育馆，常办演唱会和比赛。' },
    // 西桥区
    { name: '西桥公园', kind: 'park', at: [121.418, 31.2215], hours: '05:00–18:00', about: '老公园，晨练的老人、相亲角和一片大草坪。' },
    { name: '新北', kind: 'residence', at: [121.395, 31.2055], hours: '全天', about: '外籍人士多的居住区，周围有国际学校、西餐厅和超市。' },
    { name: '西桥商务区', kind: 'office', at: [121.4055, 31.2145], hours: '全天', about: '外企扎堆的写字楼区。' },
    { name: '澜江动物园', kind: 'fun', at: [121.365, 31.1925], hours: '08:00–17:00', about: '市里最大的动物园。' },
    { name: '长堤公园', kind: 'park', at: [121.395, 31.2265], hours: '06:00–18:00', about: '青溪边的大公园，有湖可以划船。' },
    { name: '青溪仓库', kind: 'sight', at: [121.428, 31.2385], hours: '10:00–18:00', about: '青溪边的老厂房改成的画廊和工作室。' },
    { name: '真园', kind: 'residence', at: [121.405, 31.2585], hours: '全天', about: '老镇改成的大居住区，菜场、小吃多。' },
    // 北岸区
    { name: '北岸体育场', kind: 'fun', at: [121.481, 31.2715], hours: '比赛日', about: '专业足球场，比赛日人山人海。' },
    { name: '文化公园', kind: 'park', at: [121.4785, 31.2765], hours: '06:00–18:00', about: '老公园，有纪念馆和一片湖。' },
    { name: '北街', kind: 'food', at: [121.484, 31.258], hours: '09:00–22:00', about: '老商业街，老字号小吃一家挨一家。' },
    { name: '北码头', kind: 'sight', at: [121.502, 31.2505], hours: '全天', about: '老码头改成的江边步道和国际客运码头。' },
    { name: '北岸弄堂', kind: 'residence', at: [121.4905, 31.2625], hours: '全天', about: '保留下来的老弄堂，晾衣杆横过头顶，邻里都熟。' },
    // 东林区
    { name: '澜江大学', kind: 'school', at: [121.505, 31.298], hours: '全天', about: '全市最好的综合大学之一，周边是学生和老师住的小区。' },
    { name: '五岔口', kind: 'mall', at: [121.515, 31.3005], hours: '10:00–22:00', about: '五条路交汇的商圈，学生和年轻人多。' },
    { name: '东林滨江', kind: 'park', at: [121.535, 31.2635], hours: '全天', about: '老船厂和水厂改成的江边公园，适合散步和跑步。' },
    { name: '新湾城', kind: 'residence', at: [121.522, 31.3275], hours: '全天', about: '新建的大社区，绿化多，年轻家庭多。' },
    // 江东区
    { name: '望江嘴金融城', kind: 'office', at: [121.5025, 31.2375], hours: '全天', about: '高楼最集中的金融区，银行和大公司的总部都在这里，正对江滩。' },
    { name: '望江塔', kind: 'sight', at: [121.4995, 31.24], hours: '09:00–21:30', about: '全市最高的楼，顶上有观景台。' },
    { name: '世纪广场', kind: 'mall', at: [121.527, 31.2295], hours: '10:00–22:00', about: '大商场、写字楼和地铁换乘站。' },
    { name: '中央公园', kind: 'park', at: [121.551, 31.2165], hours: '07:00–18:00', about: '全市最大的城市公园，草坪和湖。' },
    { name: '江东医院', kind: 'hospital', at: [121.535, 31.2235], hours: '全天', about: '江东区最大的综合医院。' },
    { name: '科学城', kind: 'office', at: [121.59, 31.2055], hours: '全天', about: '芯片、生物医药和软件公司扎堆的园区，加班的人多。' },
    { name: '金港', kind: 'industry', at: [121.6, 31.2605], hours: '全天', about: '工厂和外企的出口加工区。' },
    { name: '港区', kind: 'industry', at: [121.59, 31.35], hours: '全天', about: '集装箱码头、仓库和自贸区，大货车很多。' },
    { name: '博览园', kind: 'sight', at: [121.4885, 31.1795], hours: '10:00–21:00', about: '当年办博览会留下的场馆，现在是展馆、美术馆和演出场地。' },
    { name: '澜江乐园', kind: 'fun', at: [121.657, 31.1445], hours: '09:00–21:00', about: '主题乐园和度假区，节假日要排很久的队。' },
    { name: '沙城古镇', kind: 'sight', at: [121.7, 31.1905], hours: '全天', about: '江东的老镇，老街和城墙遗址。' },
    { name: '东部机场', kind: 'airport', at: [121.805, 31.15], hours: '全天', about: '国际机场，国际航班大多在这里起降。' },
    { name: '临海新城', kind: 'residence', at: [121.905, 30.9155], hours: '全天', about: '围着临海湖建的新城，有大学和造车厂，人还不多。' },
    // 新庄区
    { name: '西站枢纽', kind: 'station', at: [121.32, 31.1955], hours: '全天', about: '高铁站和西郊机场连在一起的交通枢纽。' },
    { name: '西郊机场', kind: 'airport', at: [121.335, 31.198], hours: '06:00–24:00', about: '国内航班为主的机场，和高铁站连通。' },
    { name: '七里古镇', kind: 'sight', at: [121.35, 31.155], hours: '全天', about: '离市区最近的古镇，老街、小吃和皮影戏。' },
    { name: '新庄', kind: 'mall', at: [121.385, 31.1105], hours: '10:00–22:00', about: '近郊的商圈和换乘站，周围是成片的小区。' },
    { name: '漕溪', kind: 'office', at: [121.39, 31.1705], hours: '全天', about: '老牌高新园区，写字楼和研发中心多。' },
    { name: '澜江理工大学（新庄校区）', kind: 'school', at: [121.43, 31.0255], hours: '全天', about: '大学城里最大的校园，骑车都要十几分钟。' },
    { name: '紫江高新区', kind: 'office', at: [121.45, 31.0205], hours: '全天', about: '挨着大学城的研发园区。' },
    // 江口区
    { name: '江口钢铁厂', kind: 'industry', at: [121.44, 31.4205], hours: '全天', about: '沿江的大钢铁厂，三班倒。' },
    { name: '邮轮码头', kind: 'station', at: [121.495, 31.395], hours: '全天', about: '国际邮轮码头，大船靠岸时很热闹。' },
    { name: '炮台湿地公园', kind: 'park', at: [121.485, 31.402], hours: '06:00–18:00', about: '江边的老炮台和湿地，看江看船。' },
    { name: '江口新城', kind: 'residence', at: [121.4305, 31.3955], hours: '全天', about: '江口区的新城和商场。' },
    { name: '樱花公园', kind: 'park', at: [121.38, 31.35], hours: '06:00–18:00', about: '春天的樱花很有名。' },
    { name: '共和新村', kind: 'residence', at: [121.445, 31.3355], hours: '全天', about: '大片的老公房和新小区，房租比市区便宜。' },
    // 嘉禾区
    { name: '嘉禾老城', kind: 'sight', at: [121.25, 31.3805], hours: '全天', about: '孔庙、老街和环城河。' },
    { name: '汽车城', kind: 'industry', at: [121.165, 31.2905], hours: '全天', about: '汽车厂、汽车博物馆和配套的居住区。' },
    { name: '赛车场', kind: 'fun', at: [121.22, 31.34], hours: '比赛日', about: '国际赛车场，平时可以参观和跑卡丁车。' },
    { name: '南芗古镇', kind: 'sight', at: [121.31, 31.3005], hours: '全天', about: '小笼包的老家，老街和古猗园。' },
    // 青湖区
    { name: '会展中心', kind: 'sight', at: [121.265, 31.1905], hours: '展会期间', about: '全国最大的会展中心之一，大展期间附近的酒店都订满。' },
    { name: '珠溪古镇', kind: 'sight', at: [121.05, 31.1105], hours: '全天', about: '水乡古镇，石桥、老街和摇橹船。' },
    { name: '云湖', kind: 'park', at: [121.01, 31.0955], hours: '全天', about: '全市最大的湖，湖边有骑行道和度假村。' },
    { name: '青湖新城', kind: 'residence', at: [121.12, 31.1505], hours: '全天', about: '青湖区的新城，安静，房子大。' },
    // 西山区
    { name: '西山', kind: 'park', at: [121.19, 31.1], hours: '06:00–18:00', about: '全市唯一的山，山顶有天文台和教堂。' },
    { name: '西山大学城', kind: 'school', at: [121.2135, 31.0605], hours: '全天', about: '好几所大学的校园连在一起。' },
    { name: '西山老城', kind: 'sight', at: [121.2355, 31.0105], hours: '全天', about: '老城、古塔和园林。' },
    // 南海区
    { name: '海桥新城', kind: 'residence', at: [121.47, 30.9205], hours: '全天', about: '南海区的新城，政府和商场都在这里。' },
    { name: '金滩', kind: 'fun', at: [121.34, 30.729], hours: '全天', about: '城市海滩，夏天人很多。' },
    { name: '化工区', kind: 'industry', at: [121.45, 30.8], hours: '全天', about: '沿海的化工园区。' },
    { name: '海湾森林公园', kind: 'park', at: [121.65, 30.8605], hours: '07:00–17:00', about: '海边的大片人工林。' },
    // 沧洲区
    { name: '沧城', kind: 'residence', at: [121.4, 31.63], hours: '全天', about: '沧洲岛上的县城，生活节奏慢。' },
    { name: '东滩湿地', kind: 'park', at: [121.93, 31.515], hours: '08:00–17:00', about: '候鸟保护区，冬天有成群的候鸟。' },
    { name: '沧洲森林公园', kind: 'park', at: [121.45, 31.69], hours: '07:00–17:00', about: '岛上的大片森林。' },
];
