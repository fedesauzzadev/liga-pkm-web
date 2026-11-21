# SPEC-C: Evento TrainerAppeared

**Objetivo:** Implementar la lógica necesaria en el motor para que, al detectar un combate de gimnasio, se emita un evento `TrainerAppeared` antes de iniciar el combate.

**AC-1:** Modificar `packages/engine/src/battle-core.ts` para que al configurar una batalla de tipo `gym`, se genere un evento `TrainerAppeared` en la cola.
**AC-2:** Asegurar que el `BattleChoreographer` pueda procesar este nuevo evento (será necesario actualizar la interfaz del coreógrafo).
**AC-3:** El evento debe contener el ID del entrenador (`brock`, `misty`, `koga`, `giovanni`) para que el UI sepa qué sprite mostrar.

**Estado:** TODO.
