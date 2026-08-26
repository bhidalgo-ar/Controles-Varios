#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Corre el paralelo completo y emite el Excel.

    python paralelo.py --config config/opmobility-florida.json \
        --meta4 tabulado_h.xlsx --pdf liqui.pdf \
        --axton Tabulado_AXTON.xls --equivalencias equivalencias.xlsx \
        --periodo "1ra Quincena Agosto 2026" --salida paralelo.xlsx

El orden no es decorativo: primero se prueba que los archivos se leen bien
(el ancla contra el PDF y la aritmetica interna de cada uno) y sólo despues se
compara. Si el ancla no cierra, corta: un cruce sobre un archivo mal leido
devuelve numeros coherentes y equivocados, que es el error que nadie detecta.

Con --sin-excel hace solo las validaciones y el resumen por consola. Sirve para
la primera pasada, cuando todavia se esta acomodando el config del cliente.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lectores as L           # noqa: E402
import cruce as C              # noqa: E402
import excel_resultado as X    # noqa: E402


def plata(v):
    return f"{v:,.2f}"


def main():
    ap = argparse.ArgumentParser(description="Paralelo Meta4 -> Axton")
    ap.add_argument('--config', required=True, help="JSON del cliente")
    ap.add_argument('--meta4', required=True, help="Tabulado horizontal de Meta4 (.xlsx)")
    ap.add_argument('--axton', required=True, help="Tabulado de Axton (.xls, en realidad HTML)")
    ap.add_argument('--equivalencias', required=True, help="Tabla de equivalencias (.xlsx)")
    ap.add_argument('--pdf', help="PDF 'Control de liquidacion' de Meta4 (el ancla)")
    ap.add_argument('--periodo', default="", help="Texto del periodo, para el encabezado")
    ap.add_argument('--salida', default="paralelo.xlsx")
    ap.add_argument('--ruido', type=float, default=1.00,
                    help="De aca para abajo no se comenta la diferencia (default $1)")
    ap.add_argument('--sin-excel', action='store_true')
    ap.add_argument('--forzar', action='store_true',
                    help="Sigue aunque las validaciones fallen. Usar sabiendo lo que se pierde.")
    a = ap.parse_args()

    cfg = json.load(open(a.config, encoding='utf-8'))
    modo = cfg.get('modoLegajo', 'sinCeros')

    print("== Leyendo archivos ==")
    m = L.leerMeta4(a.meta4, cfg['meta4'], modo)
    ax = L.leerAxton(a.axton, modo)
    eq = L.leerEquivalencias(a.equivalencias)
    print(f"  Meta4: {len(m['rows'])} liquidaciones, "
          f"{len(set(r['legajo'] for r in m['rows']))} legajos, {len(m['codigos'])} columnas de concepto")
    print(f"  Axton: {len(ax['rows'])} liquidaciones, "
          f"{len(set(r['legajo'] for r in ax['rows']))} legajos, {len(ax['codigos'])} columnas de concepto")
    print(f"  Axton dice: {ax['preambulo'][:150]}")
    print(f"  Tipos de liquidacion en Axton: {ax['tipos']}")
    print(f"  Equivalencias: {len(eq['pares'])} pares usables, "
          f"{len(eq['sinAxton'])} sin codigo de Axton, {len(eq['sinMeta4'])} sin codigo de Meta4")

    problemas = []

    print("\n== Validacion 1: cada archivo contra si mismo ==")
    habsM4, dtosM4 = C.clasificarMeta4(m, cfg['meta4'])
    fallasM4 = C.validarMeta4(m, habsM4, dtosM4)
    print(f"  Meta4, Haberes - Descuentos = NETO: "
          f"{len(m['rows']) - len(fallasM4)} de {len(m['rows'])} filas")
    for leg, msg in fallasM4[:5]:
        print(f"     legajo {leg}: {msg}")
    if fallasM4:
        problemas.append("la clasificacion de conceptos de Meta4 no reproduce el NETO "
                         "(revisar 'descuentos' y 'noSonConceptos' del config)")

    habsAx, retsAx, exesAx, basesAx = C.clasificarAxton(ax, cfg['axton'])
    fallasAx = C.validarAxton(ax, habsAx, retsAx, exesAx)
    print(f"  Axton, Bruto - Retenciones + Exento = Neto: "
          f"{len(ax['rows']) - len(fallasAx)} de {len(ax['rows'])} filas")
    for leg, msg in fallasAx[:5]:
        print(f"     legajo {leg}: {msg}")
    if fallasAx:
        problemas.append("la clasificacion de conceptos de Axton no reproduce el Neto "
                         "(revisar 'retenciones' y 'exentos' del config: casi siempre es "
                         "un codigo nuevo que el cliente estreno este mes)")

    ancla = {'totalExcel': 0.0, 'totalPdf': 0.0, 'comparados': 0,
             'difieren': [], 'sinBloqueEnPdf': [], 'bloquesPdf': 0}
    if a.pdf:
        print("\n== Validacion 2: el ancla, Excel de Meta4 contra el PDF de la liqui ==")
        pdf = L.leerPdf(a.pdf, modo)
        ancla = C.anclarConPdf(m, pdf)
        print(f"  fichas de empleado en el PDF: {ancla['bloquesPdf']}")
        print(f"  neto Excel {plata(ancla['totalExcel'])} | neto PDF {plata(ancla['totalPdf'])}"
              f" | diferencia {plata(ancla['totalExcel'] - ancla['totalPdf'])}")
        print(f"  legajos donde no coincide: {len(ancla['difieren'])}"
              f" | legajos sin ficha en el PDF: {len(ancla['sinBloqueEnPdf'])}")
        for x in ancla['difieren'][:5]:
            print(f"     legajo {x[0]}: excel {plata(x[1])} vs pdf {plata(x[2])} ({plata(x[3])})")
        if ancla['difieren'] or ancla['sinBloqueEnPdf']:
            problemas.append("el Excel de Meta4 no reproduce el PDF de la liqui: "
                             "puede ser otro periodo, otro tipo de liquidacion, o el "
                             "archivo equivocado")
    else:
        print("\n== Validacion 2: SIN PDF ==")
        print("  Sin el PDF no hay forma de probar que el Excel de Meta4 es el del periodo"
              " correcto. Se puede seguir, pero el resultado no queda anclado a nada.")

    if problemas and not a.forzar:
        print("\n>>> NO SIGO. Antes de cruzar hay que resolver esto:")
        for p in problemas:
            print(f"    - {p}")
        print("\n    Con --forzar corre igual, sabiendo que el detalle va a estar mal.")
        return 1

    print("\n== Cruce ==")
    res = C.cruzar(m, ax, eq, cfg)
    porLegajo = res['porLegajo']
    totM4 = sum(v['netoM4'] for v in porLegajo)
    totAx = sum(v['netoAx'] for v in porLegajo)
    conDif = [v for v in porLegajo if abs(v['difNeto']) > a.ruido]
    chico = [v for v in porLegajo if 0.01 < abs(v['difNeto']) <= a.ruido]
    sinExpl = [v for v in porLegajo if abs(v['sinExplicar']) > a.ruido]
    print(f"  legajos comparados: {len(porLegajo)}"
          f" | solo en Meta4: {len(res['soloM4'])} | solo en Axton: {len(res['soloAx'])}")
    if res['soloM4']:
        print(f"     solo en Meta4: {', '.join(res['soloM4'][:20])}")
    if res['soloAx']:
        print(f"     solo en Axton: {', '.join(res['soloAx'][:20])}")
    print(f"  NETO Meta4 {plata(totM4)} | Axton {plata(totAx)} | diferencia {plata(totAx - totM4)}")
    print(f"  cierran exacto: {len(porLegajo) - len(conDif) - len(chico)}"
          f" | difieren <= ${a.ruido:,.2f}: {len(chico)} | difieren de verdad: {len(conDif)}")

    print("\n== Validacion 3: la diferencia de neto se descompone sin resto ==")
    print(f"  legajos cuya diferencia NO se explica con sus conceptos: {len(sinExpl)}")
    for v in sinExpl[:5]:
        print(f"     legajo {v['legajo']}: diferencia {plata(v['difNeto'])}, "
              f"explicado {plata(v['explicado'] + v['explicadoExtra'])}, "
              f"queda sin explicar {plata(v['sinExplicar'])}")
    if sinExpl:
        print("  >>> Hay conceptos afuera del mapeo. Mirar la hoja 'Sin comparar' del Excel:"
              " suele ser un codigo nuevo de Axton que hay que declarar en 'mapeosDeclarados'.")

    if conDif:
        print("\n== Los legajos con diferencia ==")
        for v in sorted(conDif, key=lambda v: -abs(v['difNeto']))[:15]:
            print(f"  legajo {v['legajo']:>7}  Meta4 {plata(v['netoM4']):>16} "
                  f"Axton {plata(v['netoAx']):>16}  dif {plata(v['difNeto']):>14}")
            for f in sorted([f for f in v['conceptos'] if abs(f['aporteNeto']) > a.ruido],
                            key=lambda f: -abs(f['aporteNeto']))[:6]:
                print(f"        {f['concepto'][:34]:<36} {f['codM4']:>10} -> {f['codAx']:<14}"
                      f" mueve el neto {plata(f['aporteNeto']):>14}  {f['estado']}")

    if a.sin_excel:
        print("\n(sin Excel por --sin-excel)")
        return 0

    meta = {
        'cliente': cfg.get('cliente', ''),
        'periodo': a.periodo,
        'axtonNombre': os.path.basename(a.axton),
        'preambulo': ax['preambulo'],
        'tipos': ax['tipos'],
        'pares': len(eq['pares']),
        'sinAxton': eq['sinAxton'],
        'sinMeta4': eq['sinMeta4'],
        'mapeosDeclarados': cfg.get('mapeosDeclarados', {}),
        'filasM4': f"{len(m['rows'])} — "
                   f"{len(m['rows']) - len(set(r['legajo'] for r in m['rows']))} legajos traen "
                   f"más de una y se consolidaron",
        'validaM4': f"{len(m['rows']) - len(fallasM4)} de {len(m['rows'])}",
        'validaAx': f"{len(ax['rows']) - len(fallasAx)} de {len(ax['rows'])}",
    }
    out = X.escribir(res, ancla, meta, a.salida, ruido=a.ruido)
    print(f"\n== Excel escrito: {a.salida} ==")
    print(f"   {out['legajos']} legajos, {out['conDiferencia']} con diferencia, "
          f"total {plata(out['difTotal'])}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
