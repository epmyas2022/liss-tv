# AGENTS.md

Guía para agentes de IA (y personas) que trabajen en este repositorio.
Lee este archivo completo antes de escribir o modificar código.

## 1. Descripción del proyecto

Plataforma de películas construida con **Next.js** y **TypeScript**.
El contenido proviene de múltiples **proveedores** externos. Para no acoplar la
aplicación a ninguno de ellos, el acceso a los datos se resuelve con el
**patrón Strategy**.

## 2. Principios de código (obligatorios)

### Código limpio

- Nombres descriptivos y en inglés para código (variables, funciones, clases, tipos). Evita abreviaturas ambiguas.
- Funciones pequeñas, con **una sola responsabilidad** y pocos parámetros (idealmente ≤ 3; si necesitas más, usa un objeto).
- Sin números ni strings mágicos: extráelos a constantes con nombre.
- Sin código muerto, `console.log` olvidados ni comentarios que expliquen *qué* hace el código. Comenta solo el *por qué* cuando no sea obvio.
- Retornos tempranos (early return) en lugar de `if/else` anidados.
- Evita duplicación (DRY), pero no abstraigas prematuramente: abstrae cuando exista una repetición real.
- Maneja los errores de forma explícita. Nunca uses `catch` vacíos.

### SOLID

- **S – Single Responsibility:** cada módulo, clase o función tiene una única razón para cambiar.
- **O – Open/Closed:** agregar un proveedor nuevo debe hacerse **creando** archivos, no **modificando** la lógica existente.
- **L – Liskov Substitution:** cualquier implementación de una estrategia debe poder sustituir a otra sin romper al consumidor.
- **I – Interface Segregation:** interfaces pequeñas y específicas. Por eso existen tres estrategias separadas en vez de una interfaz gigante.
- **D – Dependency Inversion:** los componentes y servicios dependen de **interfaces/abstracciones**, nunca de proveedores concretos.

### TypeScript

- `strict` activado. Prohibido `any`; usa `unknown` y estrecha el tipo.
- Define tipos/interfaces para todo dato que entre o salga de un proveedor.
- Valida datos externos en el borde (por ejemplo con Zod) antes de usarlos en la app.

## 3. Arquitectura: patrón Strategy

Existen **3 estrategias**, cada una con una responsabilidad distinta:

| Estrategia | Responsabilidad |
| --- | --- |
| `GetAll` | Obtener el listado de películas/series (con paginación o búsqueda si aplica). |
| `GetDetail` | Obtener el detalle de un título concreto. |
| `GetUrl` | Resolver la URL reproducible/descargable de un título. |

Cada estrategia se implementa **dentro de la carpeta de su proveedor**.

### Estructura de carpetas

```
src/
└── strategies/
    ├── <provider-a>/
    │   ├── get-all.strategy.ts
    │   ├── get-detail.strategy.ts
    │   ├── get-url.strategy.ts
    └── <provider-b>/
        ├── get-all.strategy.ts
        ├── get-detail.strategy.ts
        ├── get-url.strategy.ts
```

> Ajusta los nombres de carpeta/archivo si difieren en el repo; respeta siempre la convención existente.

### Reglas del patrón

1. **Contratos primero.** Las interfaces viven en `strategies/types.ts`. Toda estrategia nueva implementa su interfaz.
2. **Un proveedor = una carpeta.** Nada de lógica de un proveedor fuera de su carpeta.
3. **Los consumidores no conocen proveedores.** Páginas, componentes, route handlers y server actions piden la estrategia a través del registro/factory y trabajan solo con las interfaces. Prohibido importar directamente `strategies/<provider>/...` desde la UI.
4. **Modelo de dominio común.** Cada estrategia **transforma** la respuesta del proveedor al tipo de dominio compartido (mappers dentro de la carpeta del proveedor). La app nunca recibe formas de datos específicas de un proveedor.
5. **Sin `if/switch` por proveedor** fuera del registro. Si necesitas ramificar por proveedor, es señal de que falta una estrategia o una abstracción.
6. **Errores consistentes.** Las estrategias lanzan/retornan errores tipados del dominio (por ejemplo `ProviderError`, `NotFoundError`), no errores crudos de `fetch` o del proveedor.

### Cómo agregar un proveedor nuevo

1. Crea la carpeta `strategies/<nuevo-proveedor>/`.
2. Implementa `get-all`, `get-detail` y `get-url` cumpliendo las interfaces de `types.ts`.
3. Agrega los mappers necesarios para convertir al modelo de dominio.
4. Exporta las estrategias en `index.ts` y regístralas en `registry.ts`.
5. Añade pruebas para cada estrategia.
6. **No modifiques** código existente de otros proveedores ni de la UI.

## 4. Convenciones de Next.js

- Usa **App Router** y prioriza **Server Components**; agrega `"use client"` solo cuando haya interactividad real.
- La obtención de datos ocurre en el servidor (Server Components, route handlers o server actions), a través de las estrategias.
- Las claves, tokens y credenciales de proveedores **nunca** se exponen al cliente. Úsalas solo en el servidor mediante variables de entorno.
- Componentes pequeños y reutilizables; separa presentación (UI) de lógica (hooks/servicios).
- Usa `next/image` para imágenes y `next/link` para navegación.
- Maneja estados de carga y error con `loading.tsx`, `error.tsx` y `not-found.tsx`.

## 5. Estilo y calidad

- Respeta ESLint y Prettier del repositorio. Ejecuta el linter y el type-check antes de dar una tarea por terminada.
- Nombres de archivos en `kebab-case`; componentes React en `PascalCase`; funciones y variables en `camelCase`.
- Imports ordenados y con alias (`@/`) en lugar de rutas relativas largas.
- Commits pequeños y atómicos, con mensajes claros (por ejemplo, Conventional Commits).

## 6. Pruebas

- Cada estrategia debe tener pruebas unitarias con la respuesta del proveedor **mockeada**; no llames a servicios reales en los tests.
- Prueba el mapeo al modelo de dominio y los casos de error.
- Toda corrección de bug incluye una prueba que lo reproduzca.

## 7. Cómo debe trabajar el agente

- **Antes de codificar:** revisa el código existente y sigue sus convenciones. No reinventes lo que ya existe.
- **Cambios mínimos y enfocados:** modifica solo lo necesario para la tarea. No refactorices código ajeno a la petición sin avisar.
- **No rompas el contrato:** si un cambio exige modificar una interfaz de `strategies/types.ts`, indícalo explícitamente y actualiza todas las implementaciones.
- **No agregues dependencias** nuevas sin justificarlo.
- **Si algo es ambiguo**, pregunta o declara la suposición que hiciste en lugar de adivinar.
- **Al terminar**, resume qué cambiaste y por qué, y menciona cualquier deuda técnica o riesgo detectado.

## 8. Prohibido

- Acoplar la UI a un proveedor concreto.
- Duplicar lógica de un proveedor en otro.
- Usar `any`, `@ts-ignore` o desactivar reglas de lint sin justificación.
- Exponer credenciales o URLs privadas de proveedores en el cliente.
- Mezclar responsabilidades de `GetAll`, `GetDetail` y `GetUrl` en una sola estrategia.
