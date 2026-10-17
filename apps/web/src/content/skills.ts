import type { SkillId } from '~/game/contracts'

/** how a skill reads on screen ("You learned Shellfish", "Watching Ama · Shellfish") */
export const SKILL_LABELS: Record<SkillId, string> = {
  faces: 'Faces',
  shellfish: 'Shellfish',
  tides: 'Tides',
  corms: 'Corms',
  fire: 'Fire',
  knapping: 'Knapping',
  heat: 'Heat',
  hafting: 'Hafting',
  tracking: 'Tracking',
  spear: 'Spear',
  beads: 'Beads',
  ochre: 'Ochre',
  engraving: 'Engraving',
  hides: 'Hides',
  medicine: 'Medicine',
  stories: 'Stories',
}
