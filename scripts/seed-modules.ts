import mongoose, { Schema } from 'mongoose';

type SeedModule = {
  name: string;
  description: string;
  rules: string;
  imgUrl?: string;
  solutions: string[];
};

const seedModules: SeedModule[] = [
  {
    name: 'Simon Says',
    description:
      'Reproduire des séquences lumineuses et sonores qui s’allongent à chaque étape.',
    rules:
      'Observer la séquence complète, répéter sans erreur; la vitesse augmente à chaque étape.',
    imgUrl: '/manuals/module-simon.pdf',
    solutions: [
      'Initialisation : appuyer sur un bouton pour lancer la première séquence.',
      'Traduction par numéro de série (début/fin) pour choisir le bouton à presser.',
      'Règle 1 : chiffre au début, lettre à la fin → Bleu→Jaune, Jaune→Rouge, Vert→Bleu, Rouge→Vert.',
      'Règle 2 : chiffre au début, chiffre à la fin → Rouge→Jaune, Jaune→Bleu, Bleu→Vert, Vert→Rouge.',
      'Règle 3 : lettre au début, lettre à la fin → Rouge↔Bleu, Jaune↔Vert.',
      'Règle 4 : lettre au début, chiffre à la fin → identité (couleur inchangée).',
      'Progression : rejouer toute la séquence à chaque étape avec les traductions appliquées.',
      'Erreur : strike et séquence potentiellement réinitialisée; vitesse peut augmenter.',
      'Victoire : séquence finale reproduite sans erreur → module désactivé (GG).',
    ],
  },
  {
    name: 'Wires',
    description:
      'Couper les bons fils selon une table de correspondance couleur/symbole.',
    rules:
      'Analyser la couleur, vérifier la position, couper les fils dans l’ordre prescrit par la table.',
    solutions: [
      'Identifier le schéma de couleurs et positions.',
      'Suivre la table couleur/position pour déterminer l’ordre de coupe.',
      'Couper uniquement dans l’ordre validé; une erreur déclenche un strike.',
    ],
  },
  {
    name: 'Memory Code',
    description:
      'Retenir un code à 4 chiffres affiché brièvement et le reproduire après délai.',
    rules:
      'Mémoriser le code, attendre le signal, entrer la séquence sans erreur.',
    solutions: [
      'Mémoriser le code à 4 chiffres dès l’affichage.',
      'Attendre le signal de saisie avant d’entrer le code.',
      'Saisir le code complet sans erreur pour valider.',
    ],
  },
  {
    name: 'Keypad',
    description:
      'Appuyer sur les symboles dans l’ordre indiqué par le manuel de référence.',
    rules:
      'Identifier les symboles, comparer à la table de référence, valider la séquence dans l’ordre indiqué.',
    solutions: [
      'Identifier chaque symbole affiché.',
      'Comparer la colonne de référence dans le manuel.',
      'Appuyer dans l’ordre exact défini par la colonne choisie.',
    ],
  },
  {
    name: 'Morse Relay',
    description:
      'Traduire un signal Morse court en mot-clé pour déverrouiller le module.',
    rules:
      'Compter les points/traits du Morse, identifier les lettres, envoyer le mot-clé final.',
    solutions: [
      'Écouter/observer le Morse et segmenter points/traits.',
      'Traduire chaque lettre via l’alphabet Morse.',
      'Composer le mot-clé et l’envoyer pour valider.',
    ],
  },
];

const moduleSchema = new Schema<SeedModule>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    rules: { type: String, required: true },
    imgUrl: { type: String, required: false },
    solutions: { type: [String], required: true },
  },
  { collection: 'moduleentities', timestamps: false },
);

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) {
    throw new Error(
      'DATABASE_URL manquant dans les variables d’environnement.',
    );
  }

  await mongoose.connect(uri);
  const ModuleModel = mongoose.model<SeedModule>('ModuleEntity', moduleSchema);

  for (const mod of seedModules) {
    await ModuleModel.updateOne(
      { name: mod.name },
      { $setOnInsert: mod },
      { upsert: true },
    );
    console.log(`✔ Module prêt : ${mod.name}`);
  }

  await mongoose.disconnect();
  console.log('✅ Seed modules terminé.');
}

main().catch((err) => {
  console.error('❌ Seed échoué :', err);
  process.exit(1);
});
