#!/usr/bin/env python3
# hebi 破坏试验台账：每一把刀都在副本上改一个字段，然后跑被点名的那道闸，
# 看它是不是真的红、而且**点名**台账里写的那半条等式。真仓一个字节不动。
#
# 这个文件 2026-10-03 之前住在仓外的 `_tmp-hebi-sab.py`。那句话有两处不对：
#   * 住在仓外 = 不进版本控制、CI 看不见它、`npm run sabotage` 也调不到它。README 写"14 枪 /
#     与预期不符 0"，于是这句话只活在某一台机器的终端记录里，改断言的人不会撞上它；
#   * 副本落在工作区根目录的 `_tmp-hebi-copy/`：那是**所有会话共用**的一层，两个 agent 同时
#     跑台账会互相把对方的副本删掉。搬进仓里之后副本在 `_sabotage-copy/`（.gitignore 里）。
#
# 四条规矩：
#   1. 每把刀之前重新拷一份树（上一把刀的残留不许叠在这一把上）；
#   2. needle 必须在目标文件里恰好出现 1 次，对不上就记 ERROR —— 静默跳过等于没测；
#   3. 先跑对照（未改动的副本），两道闸都必须绿，否则刀红了也不知道是不是本来就红的；
#   4. 点名要**整段相等**：`D2` 不能被 `D2a`/`D2b` 顶掉。旧台架用的是子串判定，而本仓的
#      标签恰好全是 D2 / D2a / D2b 这一族，"红了但红在隔壁"这种账它记不下来。
import os
import re
import shutil
import subprocess
import sys

SRC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORK = os.path.join(SRC, '_sabotage-copy')
IGNORE = shutil.ignore_patterns('.git', 'node_modules', '_tmp-verify', '_site', '_sabotage-copy',
                                '.DS_Store')

GATES = {
    'doctest': (['node', 'tools/doctest.mjs'], re.compile(r'^\s*FAIL (D[0-9]+[ab]?\S*)', re.M)),
    'balance': (['node', 'tools/balance.mjs'], re.compile(r'^\s*\*\*RED\*\* (B[0-9]+b?\S*)', re.M)),
}


def recopy():
    if os.path.exists(WORK):
        shutil.rmtree(WORK)
    shutil.copytree(SRC, WORK, ignore=IGNORE)


def run(gate):
    argv, lab_re = GATES[gate]
    env = dict(os.environ)
    if gate == 'balance':
        env['SAMPLES'] = '20'
    p = subprocess.run(argv, cwd=WORK, capture_output=True, text=True, env=env, timeout=900,
                       encoding='utf-8', errors='replace')
    out = p.stdout + p.stderr
    tail = next((ln.strip() for ln in out.split('\n') if 'rows:' in ln or '合计红线' in ln), '')
    return p.returncode, [m.strip() for m in lab_re.findall(out)], tail


KNIVES = [
    # kid, file, needle, repl, 跑哪些闸, 期望点名的那条等式
    ('H1', 'README.md', '| 高 | 8×8 | 5 | 86 步 / 257 ms |', '| 高 | 8×8 | 5 | 99 步 / 257 ms |',
     ['doctest'], 'D1'),
    ('H2', 'js/ui/game.js', 'med: { steps: 86, ms: 257 }', 'med: { steps: 90, ms: 257 }',
     ['balance', 'doctest'], 'B5'),
    ('H3', 'README.md', 'P2-围 P3-眼 P0-区', 'P2-围 P3-眼', ['doctest'], 'D2'),
    ('H4', 'js/engine/pencil.js', '`P0-区 ${comp.length} 格连通块`', '`P0-块 ${comp.length} 格连通块`',
     ['doctest'], 'D2b'),
    ('H5', 'README.md', '闸的形状：腿 7 条', '闸的形状：腿 8 条', ['doctest'], 'D3'),
    ('H6', 'tools/verify.sh', 'LEGS=${LEGS:-core play win mouse touch keys save}',
     'LEGS=${LEGS:-core play win mouse touch keys save foo}', ['doctest'], 'D3'),
    ('H7', 'README.md', '端口：本地 5262', '端口：本地 5263', ['doctest'], 'D4'),
    ('H8', 'README.md', '唯一性计数本轮最大 10822 节点', '唯一性计数本轮最大 2500000 节点',
     ['doctest'], 'D5b'),
    ('H9', 'README.md', '| `node tools/doctest.mjs` | check | `Docs are asserted surface` |\n', '',
     ['doctest'], 'D6b'),
    ('H10', '.github/workflows/ci.yml', 'SAMPLES: "20"', 'SAMPLES: "21"', ['doctest'], 'D7'),
    ('H11', 'tools/balance.mjs', 'const envn = +process.env.SAMPLES;', 'const envn = 0;',
     ['doctest'], 'D7b'),
    ('H12', 'README.md', '每形态 302 条', '每形态 300 条', ['doctest'], 'D8'),
    ('H14', '.github/workflows/ci.yml', '        run: python3 tools/sabotage.py',
     '        run: echo "ledger not wired"', ['doctest'], 'D6c'),
    # D11 那一组钉的是"门也在家门口"。这两把刀分别回答：钉漂了会不会红、调用被摘掉会不会红。
    ('H15', 'tools/verify.sh', 'LOGIC_EXPECTS="doctest:43 sabotage:17"',
     'LOGIC_EXPECTS="doctest:41 sabotage:17"', ['doctest'], 'D11b'),
    ('H16', 'tools/verify.sh', 'node "$HERE/tools/doctest.mjs" >"$LLOG" 2>&1\n',
     '', ['doctest'], 'D11d'),
    ('N1', 'README.md', '一条规则要能被点名，才谈得上「推不出来时该怪谁」。',
     '一条规则要能被点名，才谈得上「推不出来时该怪谁」。这一句是台账的对照组：它不承载任何数，改它不该让闸红。',
     ['doctest'], ''),
]

# 命令刀：不往文件里种错，而是**照着当年空跑的那个子命令再敲一遍**，看它现在会不会红。
# H13 打的是 `LEGS=hint`（hint 是 play 腿里的一条 scenario，不是腿名）：
# 补闸之前它一声不响地跑出 `=== ALL GREEN ===`、一份报告都没有；
# 现在 verify.sh 的 `*)` 分支必须点名「未知的腿」并让 rc≠0。
CMD_KNIVES = [
    ('H13', {'LEGS': 'hint'}, ['bash', 'tools/verify.sh'], '未知的腿'),
]


def main():
    recopy()
    print('台架：tools/sabotage.py，副本在 _sabotage-copy/（真仓不动）')
    print(f'刀 {len(KNIVES) + len(CMD_KNIVES)} 把：文件刀 {len(KNIVES)} 把 + 命令刀 {len(CMD_KNIVES)} 把')
    print('对照（副本未改动）：')
    ctl_bad = []
    for g in ('doctest', 'balance'):
        rc, labels, tail = run(g)
        print(f'  {g:8s} rc={rc} · {tail or labels}')
        if rc != 0:
            ctl_bad.append(g)
    if ctl_bad:
        print(f'CONTROL FAILED：未改动的副本上 {"/".join(ctl_bad)} 已经是红的，刀的结论没有意义')
        shutil.rmtree(WORK, ignore_errors=True)
        return 2

    mismatch = []
    print('\n刀（每把之前重新拷一份树）：')
    for kid, path, needle, repl, gates, want in KNIVES:
        expect_red = kid != 'N1'
        recopy()
        fp = os.path.join(WORK, path)
        with open(fp, encoding='utf8') as fh:
            src = fh.read()
        if src.count(needle) != 1:
            mismatch.append(kid)
            print(f'  {kid:3s} ERROR needle 在 {path} 里出现 {src.count(needle)} 次（要恰好 1 次）')
            continue
        with open(fp, 'w', encoding='utf8') as fh:
            fh.write(src.replace(needle, repl))
        flat, detail, any_red = [], [], False
        for g in gates:
            rc, labels, tail = run(g)
            any_red = any_red or rc != 0
            flat += [f'{g}:{l}' for l in labels]
            detail.append(f'{g} rc={rc}' + (f' 红={labels}' if rc else (f'（{tail}）' if tail else '')))
        got = '红' if any_red else '不红'
        named = (not expect_red) or any(lab.split(':', 1)[1] == want for lab in flat)
        good = any_red == expect_red and named
        if not good:
            mismatch.append(kid)
        why = '' if named else f'（红了但没有整段等于 {want} 的点名行；实跑={flat or "无标签"}）'
        print(f'  {kid:3s} 期望={"红" if expect_red else "不红"} 实跑={got} '
              f'{"OK" if good else "与预期不符"}{why} · {" · ".join(detail)}')

    print(f'\n命令刀（在未改动的副本上照敲当年空跑的那条命令）：')
    for kid, envs, argv, want in CMD_KNIVES:
        recopy()
        env = dict(os.environ)
        # 这把刀叫的是 tools/verify.sh，而 verify.sh 现在自己也叫台账（门从 CI 搬到家门口）。
        # 不给嵌套那一层设哨兵就是 verify→sabotage→verify→…没有底。
        env['HEBI_VERIFY_INSIDE_LEDGER'] = '1'
        env.update(envs)
        try:
            p = subprocess.run(argv, cwd=WORK, capture_output=True, text=True, env=env,
                               encoding='utf-8', errors='replace', timeout=600)
        except subprocess.TimeoutExpired:
            mismatch.append(kid)
            print(f'  {kid:3s} 与预期不符 · 超时')
            continue
        out = p.stdout + p.stderr
        named = want in out
        good = p.returncode != 0 and named
        if not good:
            mismatch.append(kid)
        line = next((ln.strip() for ln in out.split('\n') if want in ln), '(没有点名行)')
        print(f'  {kid:3s} 期望=红+点名 实跑=rc={p.returncode} {"OK" if good else "与预期不符"} · {line[:70]}')

    total = len(KNIVES) + len(CMD_KNIVES)
    print(f'\n合计 {total} 枪 · 与预期不符 {len(mismatch)}'
          + (f'（{"/".join(mismatch)}）' if mismatch else ' · 对照 2 项都绿'))
    print(f'rows: {total} fail: {len(mismatch)}')
    # 副本里躺着的是最后一把刀改过的树（README 被种进一句假话、ci.yml 那一步被换成 echo）。
    # 留着它，下一个读仓的人就会把 `_sabotage-copy/js/ui/game.js` 当成真源来读。要看现场就重跑那一只刀。
    shutil.rmtree(WORK, ignore_errors=True)
    return 1 if mismatch else 0


if __name__ == '__main__':
    sys.exit(main())
