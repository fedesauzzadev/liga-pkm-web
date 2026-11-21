// Página /dev/icons (SPEC-F/T-047/AC-5): los 16 íconos a 16/24/48 px, costos de
// cartas de ejemplo con CostRow (los revisa el dueño en el gate G3) y fichas
// EnergyToken. Solo desarrollo, carga perezosa como /dev/fx (App.tsx).
import { demoCards } from '../battle/demo'
import { CostRow, EnergyIcon } from '../energy/EnergyIcon'
import { EnergyToken } from '../energy/EnergyToken'
import { energyFile, energyTypes } from '../energy/icons'
import { es } from '../i18n/es'
import styles from './icons-demo.module.css'

const DEMO_SIZES = [16, 24, 48] as const

const COST_CARDS = [
  demoCards.squirtle,
  demoCards.poliwag,
  demoCards.charmander,
] as const

export function IconsDemo() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{es.iconsTitle}</h1>
      <p className={styles.hint}>{es.iconsHint}</p>

      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{es.iconsColType}</th>
            {DEMO_SIZES.map((size) => (
              <th key={size} scope="col">{`${size} px`}</th>
            ))}
            <th scope="col">{es.iconsColCard}</th>
          </tr>
        </thead>
        <tbody>
          {energyTypes.map((type) => (
            <tr key={type.id} data-icon-row={type.id}>
              <th scope="row">{type.es}</th>
              {DEMO_SIZES.map((size) => (
                <td key={size} data-size={size}>
                  <EnergyIcon type={type.id} size={size} />
                </td>
              ))}
              <td>{type.energyCard ? es.iconsCardYes : es.iconsCardNo}</td>
            </tr>
          ))}
          <tr data-icon-row={energyFile.multicolor.id}>
            <th scope="row">{energyFile.multicolor.es}</th>
            {DEMO_SIZES.map((size) => (
              <td key={size} data-size={size}>
                <EnergyIcon type="multicolor" size={size} />
              </td>
            ))}
            <td>{es.iconsCardItem}</td>
          </tr>
        </tbody>
      </table>

      <section className={styles.section} aria-label={es.iconsCostTitle}>
        <h2 className={styles.sectionTitle}>{es.iconsCostTitle}</h2>
        <p className={styles.hint}>{es.iconsCostHint}</p>
        <ul className={styles.costs}>
          {COST_CARDS.flatMap((card) =>
            card.attacks.map((attack) => (
              <li key={`${card.id}-${attack.id}`} data-cost-example={attack.id}>
                <span className={styles.costName}>{`${card.name}: ${attack.name}`}</span>
                <CostRow cost={attack.cost} />
                <CostRow cost={attack.cost} size={24} />
              </li>
            )),
          )}
        </ul>
      </section>

      <section className={styles.section} aria-label={es.iconsTokenTitle}>
        <h2 className={styles.sectionTitle}>{es.iconsTokenTitle}</h2>
        <p className={styles.hint}>{es.iconsTokenHint}</p>
        <div className={styles.tokens}>
          <EnergyToken type="water" equipped />
          <EnergyToken type="fire" />
          <EnergyToken type="multicolor" />
        </div>
      </section>
    </main>
  )
}
