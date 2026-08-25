# -*- coding: utf-8 -*-
"""El cruce: Meta4 (lado correcto) contra Axton, por legajo y por concepto.

Tres cosas que no se negocian, porque cada una tapo un error real:

1. CONSOLIDAR POR LEGAJO LOS DOS LADOS. El Tabulado trae una fila por
   liquidacion, no por empleado. Si se pisa en vez de sumar, salen diferencias
   falsas en todos los que tuvieron doble paga.
2. VALIDAR CADA ARCHIVO CONTRA SI MISMO antes de comparar. Si en Meta4 no da
   Haberes - Descuentos = NETO en todas las filas, o en Axton no da
   Bruto - Retenciones + Exento = Neto, entonces la clasificacion de conceptos
   esta mal y el cruce va a mentir con numeros coherentes.
3. QUE LA DIFERENCIA DE NETO SE DESCOMPONGA SIN RESTO. Si la suma de los
   aportes de cada concepto no da la diferencia del neto, hay un concepto que
   quedo afuera del mapeo. Es el chequeo que prueba que el Excel sirve.
"""
import collections


def esBase(codigo, prefijos):
    return any(codigo.startswith(p) for p in prefijos)


def clasificarMeta4(m, cfg):
    """Devuelve (haberes, descuentos) como listas de codigos."""
    noConcepto = set(cfg.get('noSonConceptos', []))
    dtos = [c for c in cfg.get('descuentos', []) if c in set(m['codigos'])]
    habs = [c for c in m['codigos'] if c not in noConcepto and c not in set(dtos)]
    return habs, dtos


def clasificarAxton(a, cfg):
    """Devuelve (haberes, retenciones, exentos, bases)."""
    prefBase = cfg.get('prefijosDeBase', ['8', '9'])
    rets = [c for c in cfg.get('retenciones', []) if c in set(a['codigos'])]
    exes = [c for c in cfg.get('exentos', []) if c in set(a['codigos'])]
    bases = [c for c in a['codigos'] if esBase(c, prefBase)
             and c not in set(rets) and c not in set(exes)]
    resto = [c for c in a['codigos']
             if c not in set(rets) and c not in set(exes) and c not in set(bases)]
    return resto, rets, exes, bases


def validarMeta4(m, habs, dtos, tol=0.01):
    """Haberes - Descuentos = NETO, fila por fila."""
    fallas = []
    for r in m['rows']:
        if r['neto'] is None:
            fallas.append((r['legajo'], 'la fila no trae NETO'))
            continue
        H = sum(v for c, v in r['conceptos'].items() if c in habs and v is not None)
        D = sum(v for c, v in r['conceptos'].items() if c in dtos and v is not None)
        d = round(H - D - r['neto'], 2)
        if abs(d) > tol:
            fallas.append((r['legajo'], f"haberes {H:,.2f} - descuentos {D:,.2f} "
                                       f"da {H-D:,.2f} y el NETO dice {r['neto']:,.2f} "
                                       f"(sobra {d:,.2f})"))
    return fallas


def validarAxton(a, habs, rets, exes, tol=0.01):
    """Bruto - Retenciones + Exento = Neto, fila por fila."""
    fallas = []
    for r in a['rows']:
        H = sum(v for c, v in r['conceptos'].items() if c in habs and v is not None)
        R = sum(v for c, v in r['conceptos'].items() if c in rets and v is not None)
        E = sum(v for c, v in r['conceptos'].items() if c in exes and v is not None)
        chequeos = []
        if r['bruto'] is not None and abs(round(H - r['bruto'], 2)) > tol:
            chequeos.append(f"los haberes suman {H:,.2f} y la columna Bruto dice {r['bruto']:,.2f}")
        if r['retenciones'] is not None and abs(round(R - r['retenciones'], 2)) > tol:
            chequeos.append(f"las retenciones suman {R:,.2f} y la columna Retenciones dice {r['retenciones']:,.2f}")
        if r['exento'] is not None and abs(round(E - r['exento'], 2)) > tol:
            chequeos.append(f"los exentos suman {E:,.2f} y la columna Exento dice {r['exento']:,.2f}")
        if r['neto'] is not None and abs(round(H - R + E - r['neto'], 2)) > tol:
            chequeos.append(f"bruto - retenciones + exento da {H-R+E:,.2f} y el Neto dice {r['neto']:,.2f}")
        if chequeos:
            fallas.append((r['legajo'], "; ".join(chequeos)))
    return fallas


def anclarConPdf(m, pdf, tol=0.01):
    """El neto del Excel de Meta4 contra el 'Total Netos' del PDF, legajo por legajo."""
    porLegajo = collections.defaultdict(float)
    for r in m['rows']:
        if r['neto'] is not None:
            porLegajo[r['legajo']] += r['neto']
    faltan, difieren = [], []
    for leg, v in porLegajo.items():
        p = pdf['legajos'].get(leg)
        if p is None:
            faltan.append(leg)
            continue
        if abs(round(v - p['neto'], 2)) > tol:
            difieren.append((leg, round(v, 2), round(p['neto'], 2), round(v - p['neto'], 2)))
    return {'comparados': len(porLegajo), 'sinBloqueEnPdf': faltan, 'difieren': difieren,
            'totalExcel': round(sum(porLegajo.values()), 2),
            'totalPdf': round(sum(x['neto'] for x in pdf['legajos'].values()), 2),
            'bloquesPdf': pdf['bloques']}


def consolidar(rows, codigosPlata):
    """Una entrada por legajo, sumando sus liquidaciones. None se mantiene None."""
    out = {}
    for r in rows:
        d = out.setdefault(r['legajo'], {'nombre': r['nombre'], 'liqs': 0,
                                         'neto': 0.0, 'cpt': {}})
        d['liqs'] += 1
        if r['neto'] is not None:
            d['neto'] += r['neto']
        for c, v in r['conceptos'].items():
            if c in codigosPlata and v is not None:
                d['cpt'][c] = (d['cpt'].get(c) or 0.0) + v
    return out


def armarGrupos(a, e, cfg, tipoAx, tipoM4):
    """Un grupo de comparacion por codigo de Axton de la tabla.

    Dos formas que aparecen siempre y hay que declarar, no adivinar:
    - N a 1: un codigo de Axton que vale por dos de Meta4 (la tabla los repite).
      Se compara contra la SUMA de los de Meta4.
    - 1 a N: Axton abre una segunda columna para el mismo concepto (paso con
      Ganancias, Antiguedad, Embargo y Vacaciones). Eso no esta en la tabla:
      se declara en 'mapeosDeclarados' del config y sale listado en el Excel
      para que el analista lo confirme y corrija la tabla.
    """
    extra = cfg.get('mapeosDeclarados', {})
    cols = set(a['codigos'])
    grupos = []
    for ax, pares in e['porAxton'].items():
        todos = [ax] + [x for x in extra.get(ax, []) if x in cols]
        grupos.append({
            'axton': ax,
            'axtonTodos': todos,
            'meta4': [p['meta4'] for p in pares],
            'nombre': pares[0]['nombre'] if len(pares) == 1
                      else " + ".join(p['nombre'] for p in pares),
            'existeAx': any(c in cols for c in todos),
        })
    for g in grupos:
        tipos = {tipoAx(c) for c in g['axtonTodos'] if c in cols}
        if tipos and len(tipos) == 1:
            g['tipo'] = tipos.pop()
        else:
            t2 = {tipoM4(c) for c in g['meta4']}
            g['tipo'] = t2.pop() if len(t2) == 1 else 'Haber'
    return grupos


def signo(tipo):
    """Cuanto aporta el concepto al neto: un haber suma, un descuento resta."""
    if tipo == 'Descuento':
        return -1
    if tipo in ('Haber', 'Exento'):
        return 1
    return 0   # contribucion patronal: no toca el neto del empleado


def cruzar(m, a, e, cfg, tol=0.01):
    """Devuelve porLegajo, detalle, y los universos de cada lado."""
    habsM4, dtosM4 = clasificarMeta4(m, cfg['meta4'])
    habsAx, retsAx, exesAx, basesAx = clasificarAxton(a, cfg['axton'])
    plataM4 = set(habsM4) | set(dtosM4)
    plataAx = set(habsAx) | set(retsAx) | set(exesAx)
    patronales = {c for c in basesAx if c.startswith('88')}

    def tipoM4(c):
        return 'Descuento' if c in set(dtosM4) else 'Haber'

    def tipoAx(c):
        if c in set(retsAx):
            return 'Descuento'
        if c in set(exesAx):
            return 'Exento'
        if c in patronales:
            return 'Contribución patronal'
        return 'Haber'

    M4 = consolidar(m['rows'], plataM4)
    AX = consolidar(a['rows'], plataAx)
    grupos = armarGrupos(a, e, cfg, tipoAx, tipoM4)

    usadosM4 = {c for g in grupos for c in g['meta4']}
    usadosAx = {c for g in grupos for c in g['axtonTodos']}

    legajos = sorted(set(M4) & set(AX), key=lambda x: int(x) if x.isdigit() else 0)
    soloM4 = sorted(set(M4) - set(AX), key=lambda x: int(x) if x.isdigit() else 0)
    soloAx = sorted(set(AX) - set(M4), key=lambda x: int(x) if x.isdigit() else 0)

    detalle, porLegajo = [], []
    for leg in legajos:
        dm, da = M4[leg], AX[leg]
        filas = []
        for g in grupos:
            if g['tipo'] == 'Contribución patronal':
                continue
            vm = [dm['cpt'][c] for c in g['meta4'] if dm['cpt'].get(c) is not None]
            va = [da['cpt'][c] for c in g['axtonTodos'] if da['cpt'].get(c) is not None]
            vm = sum(vm) if vm else None
            va = sum(va) if va else None
            if vm is None and va is None:
                continue
            dif = None if (vm is None or va is None) else round(va - vm, 2)
            # 0 contra "sin dato" es lo mismo: el concepto no se liquido en
            # ninguno de los dos. Marcarlo como diferencia seria puro ruido.
            if vm is None and (va or 0) == 0:
                est = 'Coincide'
            elif va is None and (vm or 0) == 0:
                est = 'Coincide'
            elif dif is not None:
                est = 'Coincide' if abs(dif) <= tol else 'Difiere'
            elif va is None:
                est = ('Falta en Axton (no hay columna)' if not g['existeAx']
                       else 'Falta en Axton (columna vacía)')
            else:
                est = 'Sólo en Axton'
            if est == 'Coincide':
                ap = 0.0
            elif dif is not None:
                ap = signo(g['tipo']) * dif
            else:
                ap = signo(g['tipo']) * ((va or 0) if vm is None else -(vm or 0))
            filas.append({'legajo': leg, 'concepto': g['nombre'], 'tipo': g['tipo'],
                          'codM4': "+".join(g['meta4']),
                          'codAx': "+".join(g['axtonTodos']),
                          'meta4': vm, 'axton': va, 'dif': dif,
                          'estado': est, 'aporteNeto': ap})
        extraM4 = [(c, v) for c, v in dm['cpt'].items()
                   if c not in usadosM4 and v not in (None, 0)]
        extraAx = [(c, v) for c, v in da['cpt'].items()
                   if c not in usadosAx and v not in (None, 0)]
        difNeto = round(da['neto'] - dm['neto'], 2)
        explicado = round(sum(f['aporteNeto'] for f in filas), 2)
        explicadoExtra = round(sum(v * signo(tipoAx(c)) for c, v in extraAx)
                               - sum(v * signo(tipoM4(c)) for c, v in extraM4), 2)
        porLegajo.append({
            'legajo': leg, 'nombre': dm['nombre'],
            'liqsM4': dm['liqs'], 'liqsAx': da['liqs'],
            'netoM4': dm['neto'], 'netoAx': da['neto'], 'difNeto': difNeto,
            'explicado': explicado, 'explicadoExtra': explicadoExtra,
            'sinExplicar': round(difNeto - explicado - explicadoExtra, 2),
            'conceptos': filas, 'extraM4': extraM4, 'extraAx': extraAx})
        detalle.extend(filas)

    return {
        'porLegajo': porLegajo, 'detalle': detalle, 'grupos': grupos,
        'soloM4': soloM4, 'soloAx': soloAx,
        'clasificacion': {'habsM4': habsM4, 'dtosM4': dtosM4, 'habsAx': habsAx,
                          'retsAx': retsAx, 'exesAx': exesAx, 'basesAx': basesAx,
                          'patronales': sorted(patronales)},
        'labels': {'meta4': m['labels'], 'axton': a['labels']},
    }
