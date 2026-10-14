'use strict';
const lobbyConcepts = {
  aurora: {letter:'A', name:'星际嘉年华', eyebrow:'WELCOME TO THE FUN SIDE', headline:'星轨就绪。', highlight:'快乐起飞！', category:'彩色游戏舱', detail:'五列三行，点亮你的第一条星轨。'},
  arcade: {letter:'B', name:'街机俱乐部', eyebrow:'GOOD GAMES. GOOD TIMES.', headline:'快乐这件事，', highlight:'认真玩。', category:'挑一款，开玩', detail:'星际矩阵 · 十条线，一次揭晓。'},
  cloud: {letter:'C', name:'云上游乐岛', eyebrow:'A LITTLE BREAK, A NEW WORLD', headline:'暂时离线，', highlight:'快乐上线。', category:'探索小世界', detail:'在星际矩阵，连起一片小宇宙。'},
  festival: {letter:'A1', family:'aurora', name:'高能街机', eyebrow:'PLAYROOM / COSMIC FESTIVAL', welcome:'欢迎来到快乐主场', headline:'下一站，', highlight:'快乐星球。', category:'游乐舱已开放', detail:'十条星轨，一起点亮主舞台。', featured:'matrix', featureLabel:'主舞台 · 星际矩阵', action:'进入主舞台', sceneLabel:'GOOD TIMES AHEAD', cardLabel:'PLAY', ribbon:['9 座游乐舱','选个喜欢的','即刻开玩']},
  depot: {letter:'A2', family:'aurora', name:'银河补给站', eyebrow:'PLAYROOM / GALACTIC OUTPOST', welcome:'船长，欢迎靠站', headline:'补满快乐，', highlight:'即刻出发。', category:'选择你的目的地', detail:'登上小火箭，开启星际旅程。', featured:'rocket', featureLabel:'出发推荐 · 小火箭', action:'登上小火箭', sceneLabel:'READY FOR TAKEOFF', cardLabel:'DOCK', ribbon:['7 个停靠点','机器人领航','模拟积分体验']},
  portal: {letter:'A3', family:'aurora', name:'虫洞游乐场', eyebrow:'PLAYROOM / THE PORTAL PARK', welcome:'嘿，要去哪颗星球？', headline:'穿过虫洞，', highlight:'换个世界。', category:'挑一扇传送门', detail:'跟着弹珠，探索新的落点。', featured:'plinko', featureLabel:'传送推荐 · 闪电跑道', action:'跃入闪电跑道', sceneLabel:'ANOTHER WORLD AWAITS', cardLabel:'WORLD', ribbon:['7 个小宇宙','轻轻一点','快乐跃迁']}
};
const conceptQuery = new URLSearchParams(location.search);
const defaultConcept = document.documentElement.dataset.defaultConcept || 'aurora';
const conceptKey = Object.hasOwn(lobbyConcepts, conceptQuery.get('look')) ? conceptQuery.get('look') : Object.hasOwn(lobbyConcepts, defaultConcept) ? defaultConcept : 'aurora';
const concept = lobbyConcepts[conceptKey];
document.documentElement.dataset.concept = conceptKey;
if (concept.family) document.documentElement.dataset.family = concept.family;
document.documentElement.dataset.comparison = conceptQuery.get('compare') === '1' ? 'true' : 'false';
document.title = `PLAYROOM · ${concept.letter} ${concept.name}`;
