/**
 * The Field Notes: short, accurate cards on the real evidence behind what the player just did. Researched
 * 2026-10-17 from the primary papers' abstracts and institutional reporting (cited in each `evidence` line);
 * claims are kept conservative and hedged where the field still argues. Where a note leans on recent
 * hunter-gatherer ethnography, the body says so: we can't watch people 80,000 years ago.
 */
import type { FieldNoteId } from '~/game/contracts'

export type FieldNote = {
  id: FieldNoteId
  title: string
  /** 60–120 words, plain English */
  body: string
  site: string
  date: string
  /** one sentence: how we know */
  evidence: string
  image: string
}

const img = (id: FieldNoteId) => `/art/notes/${id}.webp`

export const FIELD_NOTES: Record<FieldNoteId, FieldNote> = {
  'coastal-life': {
    id: 'coastal-life',
    title: 'Living by the sea',
    body: 'On the southern Cape coast two rich worlds meet: the fynbos, full of edible bulbs, and a cold sea full of life. At Pinnacle Point, near Mossel Bay, people were eating shellfish about 164,000 years ago, among the earliest known use of food from the sea anywhere. Some researchers argue this coast was a refuge where people could hold on through hard glacial times. Caves like Blombos, set in limestone cliffs above the shore, were returned to again and again over tens of thousands of years.',
    site: 'Pinnacle Point and Blombos Cave, South Africa',
    date: '~164,000 years ago onward',
    evidence: 'Shellfish, pigment and stone tools from Pinnacle Point Cave 13B, dated by radiometric methods (Marean et al., Nature 2007).',
    image: img('coastal-life'),
  },
  'shell-beads': {
    id: 'shell-beads',
    title: 'Shell beads',
    body: 'At Blombos Cave archaeologists found 41 tiny Nassarius kraussianus shells, each pierced near the lip and found in small clusters, as if they came from the same strings. These snails live in estuaries, not on the rocky shore below the cave, so someone collected them elsewhere and carried them in. Worn, polished edges around the holes show they were strung and worn, and traces of red ochre cling to some. Beads say something without words: who you are, and who you belong to.',
    site: 'Blombos Cave, South Africa',
    date: '~75,000 years ago',
    evidence: 'Use-wear on the perforations and the clustering of the shells, compared with natural shell assemblages (Henshilwood et al., Science 2004).',
    image: img('shell-beads'),
  },
  'spring-tides': {
    id: 'spring-tides',
    title: 'The moon and the tides',
    body: 'Twice a month, near the full moon and the new moon, the pulls of the sun and the moon line up and the tides swing widest. These spring tides drop the sea lowest, uncovering mussel beds that stay underwater the rest of the month. Someone who watches the moon knows when the shore will open. At Pinnacle Point, many of the shellfish people ate live low on the shore, easiest to reach at the lowest tides, which suggests people timed their trips by the moon.',
    site: 'The southern Cape coast',
    date: 'Every month, then as now',
    evidence: 'The shore zones where the Pinnacle Point shellfish species live, compared with the tides needed to reach them (Marean et al., Nature 2007).',
    image: img('spring-tides'),
  },
  shellfish: {
    id: 'shellfish',
    title: 'Mussels, limpets, turban shells',
    body: 'Brown mussels, limpets and the big turban shell fill the shell heaps of Middle Stone Age caves on this coast. Shellfish cannot run away, need no weapons, and can be gathered by almost anyone, including children and the old. A good low tide can feed a family. At Klasies River people were collecting shellfish systematically by about 120,000 years ago, and at Blombos the mix of species shifted as the shoreline moved closer to the cave or farther away.',
    site: 'Klasies River and Blombos Cave, South Africa',
    date: '~120,000–70,000 years ago',
    evidence: 'Shells and turban-shell lids identified and counted, layer by layer, from excavated cave deposits (optimal foraging study of Blombos and Klasies River, 2012).',
    image: img('shellfish'),
  },
  play: {
    id: 'play',
    title: 'Play is practice',
    body: "Play leaves almost nothing to dig up, so this note leans on recent foragers. In hunting and gathering societies, children spend much of the day in mixed-age play groups: hunting games with small spears, digging with little sticks, copying the adults' work. A review of 58 studies found that most forager children are capable food gatherers by the end of middle childhood, learning mostly through play, watching and joining in. Direct teaching of hard skills like hunting tends to come later, in adolescence.",
    site: 'Hunter-gatherer societies studied by anthropologists',
    date: 'Recent and living foragers',
    evidence: 'A meta-ethnographic review of hunter-gatherer childhood studies (Lew-Levy et al., Human Nature 2017).',
    image: img('play'),
  },
  corms: {
    id: 'corms',
    title: 'Food under the fynbos',
    body: 'The Cape fynbos is unusually rich in plants that store food underground in corms, bulbs and tubers. That starch is there in every season, waiting for anyone with a digging stick and the knowledge of where to look, and studies find many of these plants are nutritious, some comparable to potatoes. At Border Cave, people roasted starchy Hypoxis rhizomes about 170,000 years ago, the earliest direct evidence of cooking underground plant foods. Archaeologists argue this dependable carbohydrate helped people thrive on the Cape coast.',
    site: 'The Cape Floral Region; Border Cave, South Africa',
    date: '~170,000 years ago onward',
    evidence: 'Charred whole rhizomes from Border Cave matched to modern Hypoxis (Wadley et al., Science 2020).',
    image: img('corms'),
  },
  danger: {
    id: 'danger',
    title: 'Danger',
    body: 'The coast was generous but never safe. Lions, leopards and hyenas shared the land, and caves people used were at other times used by carnivores: some bones in Cape cave deposits were gathered by leopards and hyenas, not people. Puff adders bask on warm rocks and strike when stepped on. Big surf can sweep someone off the rocks. An injury or an infection could kill. Fire, company, watchfulness and knowledge passed down were how people stayed alive.',
    site: 'Klasies River and other Cape caves',
    date: 'Throughout the Middle Stone Age',
    evidence: 'Carnivore damage and carnivore-collected bones found among the food remains in Klasies River Cave 1B (Ezeimo, Wurz and Badenhorst, 2024).',
    image: img('danger'),
  },
  sharing: {
    id: 'sharing',
    title: 'Sharing the hearth',
    body: 'We cannot watch a meal 80,000 years ago, but among recent hunter-gatherers in Africa, Australia and elsewhere food is shared widely, and much of it moves because people ask for it. Anthropologist Nicolas Peterson called this demand sharing: refusing is hard, hoarding is shameful, generosity is expected. Sharing spreads risk. Today the lucky forager feeds everyone; tomorrow someone else does. It is one reason small bands could survive bad days, bad weeks and bad seasons.',
    site: 'Hunter-gatherer societies studied by anthropologists',
    date: 'Recent and living foragers',
    evidence: 'Ethnographic studies of how food moves between people in foraging societies (Peterson, American Anthropologist 1993).',
    image: img('sharing'),
  },
  fire: {
    id: 'fire',
    title: 'Fire',
    body: "Fire was already ancient when these people were born. Burned bone and plant ash inside Wonderwerk Cave, in South Africa's Northern Cape, show controlled fire about a million years ago, probably made by Homo erectus. By 80,000 years ago fire was part of everything: warmth on winter nights, light after dark, a guard against predators, a way to cook corms and shellfish, a tool for treating stone and making glue. And the hearth was where people sat together and talked.",
    site: 'Wonderwerk Cave and every Middle Stone Age hearth',
    date: '~1,000,000 years ago onward',
    evidence: 'Microscopic study of bone and plant ash burned in place inside Wonderwerk Cave (Berna et al., PNAS 2012).',
    image: img('fire'),
  },
  faces: {
    id: 'faces',
    title: 'First, faces',
    body: 'Newborn babies turn their eyes toward face-like patterns more than toward other shapes, in the first hour after birth. Over the following weeks and months they learn the particular faces of the people who care for them. Psychologists John Morton and Mark Johnson proposed that babies are born with a simple bias toward faces, and that learning builds on it. A baby born 80,000 years ago was no different from one born today: the first world anyone knows is the faces leaning close.',
    site: 'Every human infant',
    date: 'Universal',
    evidence: 'Experiments measuring how far newborns follow face-like and scrambled patterns with their eyes (Johnson et al. 1991; Morton and Johnson, Psychological Review 1991).',
    image: img('faces'),
  },
  silcrete: {
    id: 'silcrete',
    title: 'Silcrete',
    body: 'Silcrete is a hard stone that forms when dissolved silica cements sand and gravel together in the ground. It breaks with sharp, predictable edges, which makes it good for tools, though raw silcrete can be grainy and stubborn to work. There is no silcrete right by Blombos Cave, so people had to know where the outcrops were, walk to them, and carry back the best pieces. Chemical fingerprints in the stone can show which outcrop a tool came from.',
    site: 'The southern Cape coastal zone',
    date: 'Middle Stone Age',
    evidence: 'Geochemical provenancing of silcrete artefacts and outcrops in the Cape coastal zone (Nash et al., Journal of Human Evolution 2013).',
    image: img('silcrete'),
  },
  'heat-treatment': {
    id: 'heat-treatment',
    title: 'Changed by fire',
    body: 'Buried under a fire and heated slowly, silcrete changes: afterwards it flakes more easily and its fresh breaks turn glossy. Experiments for the Pinnacle Point study needed hours at around 350 °C, which means planning: digging, burying, tending a fire, then waiting. Heat treatment was the usual practice there by about 72,000 years ago, and gloss on older tools suggests it may go back 164,000 years. Before this work, the earliest known heat treatment, in Europe, was about 25,000 years old.',
    site: 'Pinnacle Point, South Africa',
    date: '~72,000 years ago, perhaps 164,000',
    evidence: 'Gloss and other changes in archaeological silcrete compared with stone heated experimentally (Brown et al., Science 2009).',
    image: img('heat-treatment'),
  },
  'still-bay': {
    id: 'still-bay',
    title: 'Still Bay points',
    body: 'Still Bay points are thin, leaf-shaped stone points worked on both faces. At Blombos many were made from heat-treated silcrete and finished by pressure flaking: pressing tiny flakes off with a pointed tool for fine control, a technique once thought to have begun in Europe tens of thousands of years later. Most of the 371 points found at Blombos are unfinished or broke in the making, a sign of how hard this was to learn. Some were hafted onto shafts as spear tips.',
    site: 'Blombos Cave and other southern African sites',
    date: '~75,000–70,000 years ago (dates still debated)',
    evidence: 'Replication experiments and a study of every Still Bay point excavated at Blombos (Mourre, Villa and Henshilwood, Science 2010; Villa, Soressi and Henshilwood).',
    image: img('still-bay'),
  },
  adhesives: {
    id: 'adhesives',
    title: 'Glue from three things',
    body: "To fix a stone point to a spear you need glue, and the best Middle Stone Age glues were compounds. At Sibudu Cave, traces on stone tools about 70,000 years old show plant gum mixed with powdered red ochre. Lyn Wadley's experiments found the recipe only works with care: the right mix of gum and ochre, gentle heat by the fire without scorching, drying at the right pace. Archaeologists read it as evidence of planning, holding several steps and materials in mind at once.",
    site: 'Sibudu Cave, South Africa',
    date: '~70,000 years ago',
    evidence: 'Residues and hafting damage on Sibudu tools, plus replication experiments (Wadley, Hodgskiss and Grant, PNAS 2009).',
    image: img('adhesives'),
  },
  tracking: {
    id: 'tracking',
    title: 'Reading the ground',
    body: 'Expert trackers read footprints, bent grass, droppings and scuffed sand to work out which animal passed, how fast, how long ago and where it is going. When the trail fades, they make a guess and test it against the ground ahead. Louis Liebenberg, who learned from Kalahari hunters, argued that this kind of reasoning may be among the oldest forms of scientific thinking. Tracks from ancient hunts rarely survive, so treat that as a thoughtful idea about the past, not a finding.',
    site: 'The Kalahari (recent trackers)',
    date: 'A skill as old as hunting',
    evidence: "Liebenberg's work with Kalahari trackers (The Art of Tracking: The Origin of Science, 1990).",
    image: img('tracking'),
  },
  hunting: {
    id: 'hunting',
    title: 'The eland',
    body: "The eland is Africa's largest antelope, big enough to feed a whole band for days. Eland bones are common at Middle Stone Age sites on the Cape coast such as Klasies River, while more dangerous animals like buffalo and bushpig are rarer. Archaeologist Richard Klein argued that eland, being relatively docile and easy to drive, were simply safer prey for hunters with stone-tipped spears. Others disagree about what the bones say of those hunters' skill, but eland clearly mattered.",
    site: 'Klasies River, South Africa',
    date: 'Middle Stone Age',
    evidence: "Counts of animal bones from the Klasies River caves (Klein's analyses from the 1970s, debated since).",
    image: img('hunting'),
  },
  reciprocity: {
    id: 'reciprocity',
    title: 'Who eats first',
    body: 'Among the !Kung of the Kalahari, as Lorna Marshall described them, meat from a hunt belonged to the owner of the first arrow to strike, and arrows were often lent, so the owner might not have hunted at all. That person divided the meat, which then flowed on through families along ties of kinship and obligation. Rules like this spread credit around and damp down boasting and jealousy. Who gets the first portions, and why, says much about what a group values.',
    site: 'The Kalahari (recent foragers)',
    date: 'Recent foragers',
    evidence: "Marshall's ethnography of !Kung meat distribution ('Sharing, talking and giving', Africa 1961).",
    image: img('reciprocity'),
  },
  networks: {
    id: 'networks',
    title: 'Gifts between bands',
    body: 'Ju/\'hoansi people keep long gift partnerships, called hxaro, with people in other bands, exchanging beads and other objects over years. Anthropologist Polly Wiessner showed these ties work as insurance: when drought or hunger hits one place, people can go and stay with partners elsewhere. Ostrich-eggshell beads in highland Lesotho were carried from hundreds of kilometres away as early as about 33,000 years ago. Some archaeologists think the Blombos shell beads hint at ties like these far earlier.',
    site: 'The Kalahari; highland Lesotho',
    date: 'Recent foragers; beads from ~33,000 years ago',
    evidence: "Wiessner's study of hxaro (1977 onward) and strontium isotopes in ostrich-eggshell beads (Stewart et al., PNAS 2020).",
    image: img('networks'),
  },
  'cumulative-culture': {
    id: 'cumulative-culture',
    title: 'Learning from each other',
    body: 'No one person could invent everything a band knew: which plants are safe, how to heat stone, when the tide will turn. Each generation learned from the last and sometimes added something. This build-up of knowledge is called cumulative culture, and it is a large part of why humans succeeded. In one experiment, people passed the skill of knapping stone tools down chains of learners far better when they were taught with words than when they could only watch and copy.',
    site: 'Everywhere people live',
    date: 'Hundreds of thousands of years',
    evidence: 'A transmission-chain experiment with 184 people learning to knap stone (Morgan et al., Nature Communications 2015).',
    image: img('cumulative-culture'),
  },
  whale: {
    id: 'whale',
    title: 'When a whale came ashore',
    body: 'Southern right whales come close to the Cape coast in winter and spring, and now and then one strands. For a band, a stranded whale is an enormous windfall of meat and fat, enough to draw neighbours from far away. In Pinnacle Point Cave 13B, a fragment of a barnacle that lives only on right whales suggests people there ate from a stranded right whale long ago. Stranded sea mammals have been scavenged on this coast since at least the Middle Pleistocene.',
    site: 'Pinnacle Point, South Africa',
    date: 'Middle Pleistocene onward',
    evidence: 'A right-whale barnacle, Cetopirus complanatus, identified in the Pinnacle Point Cave 13B deposits (Collareta et al., Zootaxa 2017).',
    image: img('whale'),
  },
  burial: {
    id: 'burial',
    title: 'The child in the cave',
    body: 'In a cave near the Kenyan coast, archaeologists found a child about two and a half to three years old, buried around 78,000 years ago. The grave was dug on purpose. The child was laid on their side with knees drawn up, probably wrapped in a shroud, the head perhaps on a soft support. Researchers named the child Mtoto, Swahili for child. It is the oldest known human burial in Africa, and it shows people caring for their dead.',
    site: 'Panga ya Saidi, Kenya',
    date: '~78,000 years ago',
    evidence: 'Analysis of the grave-pit sediments and the position of the bones (Martinón-Torres et al., Nature 2021).',
    image: img('burial'),
  },
  'engraved-ochre': {
    id: 'engraved-ochre',
    title: 'Marks on ochre',
    body: "At Blombos, pieces of red ochre were ground smooth on one face and then engraved with cross-hatched lines, much like the band under this game's title. Two pieces about 77,000 years old were reported in 2002, and later work described more engraved pieces from layers between about 100,000 and 75,000 years old. Many archaeologists read them as deliberate abstract designs, perhaps a shared tradition; others urge caution, since some lines could come from scraping ochre for powder.",
    site: 'Blombos Cave, South Africa',
    date: '~100,000–75,000 years ago',
    evidence: 'Microscopic study of the engraved pieces and dating of the layers they came from (Henshilwood et al., Science 2002; Journal of Human Evolution 2009).',
    image: img('engraved-ochre'),
  },
  ochre: {
    id: 'ochre',
    title: 'Why red ochre',
    body: 'Ochre is earth coloured by iron oxide, red or yellow, and these people used a great deal of it. At Blombos, a 100,000-year-old toolkit includes two abalone shells that held a mixed ochre paste, with grindstones, charcoal and bone nearby. Experiments show ochre works as a sunscreen and, mixed with fat, helps keep mosquitoes away; it also strengthens plant-gum glue. Its red may have carried meaning too, on skin, beads and objects. Pinnacle Point had pigment 164,000 years ago.',
    site: 'Blombos Cave and Pinnacle Point, South Africa',
    date: '~164,000 years ago onward',
    evidence: 'The Blombos ochre workshop (Henshilwood et al., Science 2011) and experiments on ochre as sunscreen and repellent (2015).',
    image: img('ochre'),
  },
  stories: {
    id: 'stories',
    title: 'Stories at the fire',
    body: "Polly Wiessner recorded conversations among the Ju/'hoansi of the Kalahari. By day, talk was mostly about work, food and complaints. At night, around the fire, it turned to stories, often about people they knew, along with singing and dancing. She argued that firelight talk helps people understand each other's minds, know people far away, and carry the big picture of how their world works. With no writing, everything a band knew lived in people.",
    site: 'The Kalahari (recent foragers)',
    date: 'As old as language',
    evidence: "A comparison of 174 daytime and night-time conversations (Wiessner, PNAS 2014).",
    image: img('stories'),
  },
}
