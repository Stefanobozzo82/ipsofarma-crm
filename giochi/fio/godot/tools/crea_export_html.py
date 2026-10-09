# Crea export.html dalla versione web del gioco (index.html di giochi/fio) aggiungendo gli agganci per l'esportazione.
# Uso: python3 crea_export_html.py ../../index.html export.html
import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
hook = ('window.__T = { P, cam, G, camera, scene, get save() { return save; }, stars, enemies, coins, solids, get boss() { return boss; }, get L() { return L; }, loadLevel };'
        ' window.__B = (typeof batchState !== "undefined") ? batchState : null;\n'
        'window.__X = { get root() { return root; }, movers, sinkers, portals, hearts, itemBoxes, lifeItems, cannons, keyItems, tino, body, feet, hands, head, tail, torso, kite,'
        ' PAINTS, pAt, NEED, CATALOG, outlineMat, HIDDEN_LAYER, starGeo, starMat, coinGeo, coinMat, gemGeo, redMat, makeGrumo };\n')
a = "setupComposer(); applyQuality();\n"
assert s.count(a) == 1
open(dst, 'w', encoding='utf-8').write(s.replace(a, a + hook))
