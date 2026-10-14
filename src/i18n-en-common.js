window.PlayroomI18n.register({
 shared:true,
 messages:{
  '语言':'Language','中文':'中文','游戏':'Games','足迹':'Activity','我的':'Profile','游戏大厅':'Game lobby','模拟积分':'Demo points','积分':'pts','分':'score',
  '金币扫雷':'Coin Sweeper','小火箭':'Rocket Run','三骰挑战':'Triple Dice','闪电跑道':'Lightning Plinko','星际赛马':'Star Derby','星际老虎机':'Cosmic Slots','星际矩阵':'Orbit Matrix','星际方块':'Block Flow','星际 2048':'Cosmic 2048','星际2048':'Cosmic 2048','星际':'Cosmic',
  '关闭':'Close','返回':'Back','返回大厅':'Back to lobby','返回游戏大厅':'Back to lobby','← 返回大厅':'← Back to lobby','← 返回游戏大厅':'← Back to lobby','游戏设置':'Game settings','游戏音效':'Sound effects','开启音效':'Enable sound','关闭音效':'Mute sound','已开启':'On','已关闭':'Off','知道了':'Got it','取消':'Cancel','继续':'Continue','确定':'Confirm','未命中':'No match','连接中…':'Connecting…','正在连接…':'Connecting…','准备中…':'Getting ready…','改选 ↗':'Change ↗','关闭面板':'Close panel','关闭弹窗':'Close dialog',
  '大':'Big','小':'Small','大小':'Big / Small','大 / 小':'Big / Small','三同号':'Triples','指定点数':'Exact total','指定总点数':'Exact total','目标':'Target','玩法':'Mode','未选择':'Not selected','已收取':'Collected','已结算':'Settled','等待结果':'Awaiting result','空格':'Empty',
  '本局得分':'Round score','个人最佳':'Personal best','本局奖励':'Round reward','本局到账':'Points received','本局净收益':'Net result','本局统计':'Round stats','玩法与奖励':'Rules & rewards','玩法奖励':'Rules & rewards','最高数字':'Highest tile','奖励':'Reward','概率':'Chance','音效':'Sound','当前余额':'Balance','余额':'Balance','入场':'Entry','含投入':'Includes entry','仅模拟积分':'Demo points only'
 },
 patterns:[
  [/^(.+) · PLAYROOM$/u,(_,name)=>window.PlayroomI18n.translate(name,'en')+' · PLAYROOM'],
  [/^PLAYROOM · (.+)$/u,(_,name)=>'PLAYROOM · '+window.PlayroomI18n.translate(name,'en')],
  [/^([\d,.+−-]+) 积分 \/ 局$/u,'$1 pts / round'],
  [/^([\d,.+−-]+) 积分$/u,'$1 pts'],
  [/^([\d,.+−-]+) 分$/u,'$1 score'],
  [/^第 (\d+) 名$/u,'Place $1'],
  [/^第 (\d+) 行，第 (\d+) 列，(.*)$/u,(_,row,col,value)=>`Row ${row}, column ${col}, ${window.PlayroomI18n.translate(value,'en')}`],
  [/^(金币扫雷|小火箭|三骰挑战|闪电跑道|星际赛马|星际老虎机|星际矩阵|星际方块|星际 2048) ?游戏$/u,(_,name)=>window.PlayroomI18n.translate(name,'en')+' game']
 ]
});
