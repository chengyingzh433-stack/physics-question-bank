/**
 * 章节模板注册表。增加学科/版本时追加一个模板，不改 UI 或数据库逻辑。
 * key/node key 是持久化标识，发布后不因文案或排序调整而改变。
 * 人教版（2019）目录核对：教师之家 /jiaocai/2058.html 至 2063.html（2026-10-23）。
 * 只包含教材册、章、节；不包含站点的综合测试资源分类。
 */
export interface ChapterTemplateNode {
  key: string
  name: string
  parentKey: string | null
}

export interface ChapterTemplateDefinition {
  key: string
  name: string
  subject: string
  edition: string
  nodes: ChapterTemplateNode[]
}

type BookDefinition = {
  key: string
  name: string
  chapters: { key: string; name: string; sections: string[] }[]
}

const physicsBooks: BookDefinition[] = [
  {
    key: 'required-1', name: '必修第一册', chapters: [
      { key: 'chapter-1', name: '第一章 运动的描述', sections: [
        '1 质点 参考系', '2 时间 位移', '3 位置变化快慢的描述——速度', '4 速度变化快慢的描述——加速度'
      ] },
      { key: 'chapter-2', name: '第二章 匀变速直线运动的研究', sections: [
        '1 实验：探究小车速度随时间变化的规律', '2 匀变速直线运动的速度与时间的关系',
        '3 匀变速直线运动的位移与时间的关系', '4 自由落体运动'
      ] },
      { key: 'chapter-3', name: '第三章 相互作用——力', sections: [
        '1 重力与弹力', '2 摩擦力', '3 牛顿第三定律', '4 力的合成和分解', '5 共点力的平衡'
      ] },
      { key: 'chapter-4', name: '第四章 运动和力的关系', sections: [
        '1 牛顿第一定律', '2 实验：探究加速度与力、质量的关系', '3 牛顿第二定律',
        '4 力学单位制', '5 牛顿运动定律的应用', '6 超重和失重'
      ] }
    ]
  },
  {
    key: 'required-2', name: '必修第二册', chapters: [
      { key: 'chapter-5', name: '第五章 抛体运动', sections: [
        '1 曲线运动', '2 运动的合成与分解', '3 实验：探究平抛运动的特点', '4 抛体运动的规律'
      ] },
      { key: 'chapter-6', name: '第六章 圆周运动', sections: [
        '1 圆周运动', '2 向心力', '3 向心加速度', '4 生活中的圆周运动'
      ] },
      { key: 'chapter-7', name: '第七章 万有引力与宇宙航行', sections: [
        '1 行星的运动', '2 万有引力定律', '3 万有引力理论的成就', '4 宇宙航行',
        '5 相对论时空观与牛顿力学的局限性'
      ] },
      { key: 'chapter-8', name: '第八章 机械能守恒定律', sections: [
        '1 功与功率', '2 重力势能', '3 动能和动能定理', '4 机械能守恒定律', '5 实验：验证机械能守恒定律'
      ] }
    ]
  },
  {
    key: 'required-3', name: '必修第三册', chapters: [
      { key: 'chapter-9', name: '第九章 静电场及其应用', sections: [
        '1 电荷', '2 库仑定律', '3 电场 电场强度', '4 静电的防止与利用'
      ] },
      { key: 'chapter-10', name: '第十章 静电场中的能量', sections: [
        '1 电势能和电势', '2 电势差', '3 电势差与电场强度的关系', '4 电容器的电容', '5 带电粒子在电场中的运动'
      ] },
      { key: 'chapter-11', name: '第十一章 电路及其应用', sections: [
        '1 电源和电流', '2 导体的电阻', '3 实验：导体电阻率的测量', '4 串联电路和并联电路',
        '5 实验：练习使用多用电表'
      ] },
      { key: 'chapter-12', name: '第十二章 电能 能量守恒定律', sections: [
        '1 电路中的能量转化', '2 闭合电路的欧姆定律', '3 实验：电池电动势和内阻的测量', '4 能源与可持续发展'
      ] },
      { key: 'chapter-13', name: '第十三章 电磁感应与电磁波初步', sections: [
        '1 磁场 磁感线', '2 磁感应强度 磁通量', '3 电磁感应现象及应用', '4 电磁波的发现及应用', '5 能量量子化'
      ] }
    ]
  },
  {
    key: 'elective-1', name: '选择性必修第一册', chapters: [
      { key: 'chapter-1', name: '第一章 动量守恒定律', sections: [
        '1 动量', '2 动量定理', '3 动量守恒定律', '4 实验：验证动量守恒定律', '5 弹性碰撞和非弹性碰撞', '6 反冲现象 火箭'
      ] },
      { key: 'chapter-2', name: '第二章 机械振动', sections: [
        '1 简谐运动', '2 简谐运动的描述', '3 简谐运动的回复力和能量', '4 单摆',
        '5 实验：用单摆测量重力加速度', '6 受迫振动 共振'
      ] },
      { key: 'chapter-3', name: '第三章 机械波', sections: [
        '1 波的形成', '2 波的描述', '3 波的反射、折射和衍射', '4 波的干涉', '5 多普勒效应'
      ] },
      { key: 'chapter-4', name: '第四章 光', sections: [
        '1 光的折射', '2 全反射', '3 光的干涉', '4 实验：用双缝干涉测量光的波长', '5 光的衍射', '6 光的偏振 激光'
      ] }
    ]
  },
  {
    key: 'elective-2', name: '选择性必修第二册', chapters: [
      { key: 'chapter-1', name: '第一章 安培力与洛伦兹力', sections: [
        '1 磁场对通电导线的作用力', '2 磁场对运动电荷的作用力', '3 带电粒子在匀强磁场中的运动', '4 质谱仪与回旋加速器'
      ] },
      { key: 'chapter-2', name: '第二章 电磁感应', sections: [
        '1 楞次定律', '2 法拉第电磁感应定律', '3 涡流、电磁阻尼和电磁驱动', '4 互感和自感'
      ] },
      { key: 'chapter-3', name: '第三章 交变电流', sections: [
        '1 交变电流', '2 交变电流的描述', '3 变压器', '4 电能的输送'
      ] },
      { key: 'chapter-4', name: '第四章 电磁振荡与电磁波', sections: [
        '1 电磁振荡', '2 电磁场与电磁波', '3 无线电波的发射和接收', '4 电磁波谱'
      ] },
      { key: 'chapter-5', name: '第五章 传感器', sections: [
        '1 认识传感器', '2 常见传感器的工作原理及应用', '3 利用传感器制作简单的自动控制装置'
      ] }
    ]
  },
  {
    key: 'elective-3', name: '选择性必修第三册', chapters: [
      { key: 'chapter-1', name: '第一章 分子动理论', sections: [
        '1 分子动理论的基本内容', '2 实验：用油膜法估测油酸分子的大小', '3 分子运动速率分布规律', '4 分子动能和分子势能'
      ] },
      { key: 'chapter-2', name: '第二章 气体、固体和液体', sections: [
        '1 温度和温标', '2 气体的等温变化', '3 气体的等压变化和等容变化', '4 固体', '5 液体'
      ] },
      { key: 'chapter-3', name: '第三章 热力学定律', sections: [
        '1 功、热和内能的改变', '2 热力学第一定律', '3 能量守恒定律', '4 热力学第二定律'
      ] },
      { key: 'chapter-4', name: '第四章 原子结构和波粒二象性', sections: [
        '1 普朗克黑体辐射理论', '2 光电效应', '3 原子的核式结构模型', '4 氢原子光谱和玻尔的原子模型',
        '5 粒子的波动性和量子力学的建立'
      ] },
      { key: 'chapter-5', name: '第五章 原子核', sections: [
        '1 原子核的组成', '2 放射性元素的衰变', '3 核力与结合能', '4 核裂变与核聚变', '5 “基本”粒子'
      ] }
    ]
  }
]

function flattenBooks(books: BookDefinition[]): ChapterTemplateNode[] {
  return books.flatMap((book) => [
    { key: book.key, name: book.name, parentKey: null },
    ...book.chapters.flatMap((chapter) => {
      const key = `${book.key}/${chapter.key}`
      const name = `${book.name} / ${chapter.name}`
      return [
        { key, name, parentKey: book.key },
        ...chapter.sections.map((section) => ({
          // 以教材节编号为标识；排序变化不会改动 key。
          key: `${key}/section-${section.split(' ')[0]}`,
          name: `${name} / ${section}`,
          parentKey: key
        }))
      ]
    })
  ])
}

export const DEFAULT_CHAPTER_TEMPLATE_KEY = 'physics-pep-2019'

export const CHAPTER_TEMPLATES: ChapterTemplateDefinition[] = [{
  key: DEFAULT_CHAPTER_TEMPLATE_KEY,
  name: '高中物理 · 人教版（2019）',
  subject: '高中物理',
  edition: '人教版（2019）',
  nodes: flattenBooks(physicsBooks)
}]
