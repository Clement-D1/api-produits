const express = require('express');

const app = express();
const PORT = 3000;

// Parse automatiquement les corps de requête JSON
app.use(express.json());

// ---------------------------------------------------------------------------
// Données en mémoire (remises à zéro à chaque redémarrage du serveur)
// ---------------------------------------------------------------------------
let produits = [
  { id: 1, nom: 'Clavier mécanique', description: 'Clavier AZERTY, switches rouges', prix: 89.99, categorie: 'Informatique' },
  { id: 2, nom: 'Gourde isotherme', description: 'Gourde inox 750 ml', prix: 19.9, categorie: 'Sport' },
];
let prochainId = 3;

const CHAMPS = ['nom', 'description', 'prix', 'categorie'];

// ---------------------------------------------------------------------------
// Validation
// partiel = false -> tous les champs obligatoires (POST, PUT)
// partiel = true  -> seuls les champs envoyés sont vérifiés (PATCH)
// ---------------------------------------------------------------------------
function valider(donnees, partiel = false) {
  if (typeof donnees !== 'object' || donnees === null || Array.isArray(donnees)) {
    return ['Le corps de la requête doit être un objet JSON'];
  }

  const erreurs = [];

  const inconnus = Object.keys(donnees).filter((c) => !CHAMPS.includes(c));
  if (inconnus.length > 0) {
    erreurs.push(`Champs non autorisés : ${inconnus.join(', ')}`);
  }

  for (const champ of CHAMPS) {
    const valeur = donnees[champ];

    if (valeur === undefined) {
      if (!partiel) erreurs.push(`Le champ "${champ}" est obligatoire`);
      continue;
    }

    if (champ === 'prix') {
      if (typeof valeur !== 'number' || !Number.isFinite(valeur) || valeur < 0) {
        erreurs.push('Le champ "prix" doit être un nombre positif');
      }
    } else if (typeof valeur !== 'string' || valeur.trim() === '') {
      erreurs.push(`Le champ "${champ}" doit être une chaîne non vide`);
    }
  }

  if (partiel && erreurs.length === 0 && Object.keys(donnees).length === 0) {
    erreurs.push('Aucun champ à modifier');
  }

  return erreurs;
}

// Middleware : récupère le produit ciblé par :id ou renvoie 404
function trouverProduit(req, res, next) {
  const id = Number(req.params.id);
  const index = produits.findIndex((p) => p.id === id);

  if (index === -1) {
    return res.status(404).json({ erreur: `Produit ${req.params.id} introuvable` });
  }

  req.indexProduit = index;
  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Lister (filtre optionnel : /produits?categorie=Sport)
app.get('/produits', (req, res) => {
  const { categorie } = req.query;
  const resultat = categorie
    ? produits.filter((p) => p.categorie.toLowerCase() === String(categorie).toLowerCase())
    : produits;

  res.status(200).json(resultat);
});

// Consulter
app.get('/produits/:id', trouverProduit, (req, res) => {
  res.status(200).json(produits[req.indexProduit]);
});

// Ajouter
app.post('/produits', (req, res) => {
  const erreurs = valider(req.body);
  if (erreurs.length > 0) {
    return res.status(400).json({ erreurs });
  }

  const { nom, description, prix, categorie } = req.body;
  const produit = { id: prochainId++, nom, description, prix, categorie };
  produits.push(produit);

  res.status(201).location(`/produits/${produit.id}`).json(produit);
});

// Remplacer (PUT = remplacement complet, tous les champs obligatoires)
app.put('/produits/:id', trouverProduit, (req, res) => {
  const erreurs = valider(req.body);
  if (erreurs.length > 0) {
    return res.status(400).json({ erreurs });
  }

  const { nom, description, prix, categorie } = req.body;
  const id = produits[req.indexProduit].id;
  produits[req.indexProduit] = { id, nom, description, prix, categorie };

  res.status(200).json(produits[req.indexProduit]);
});

// Modifier (PATCH = modification partielle, seuls les champs envoyés changent)
app.patch('/produits/:id', trouverProduit, (req, res) => {
  const erreurs = valider(req.body, true);
  if (erreurs.length > 0) {
    return res.status(400).json({ erreurs });
  }

  produits[req.indexProduit] = { ...produits[req.indexProduit], ...req.body };

  res.status(200).json(produits[req.indexProduit]);
});

// Supprimer
app.delete('/produits/:id', trouverProduit, (req, res) => {
  produits.splice(req.indexProduit, 1);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Gestion des erreurs
// ---------------------------------------------------------------------------

// Route inconnue
app.use((req, res) => {
  res.status(404).json({ erreur: `Route ${req.method} ${req.originalUrl} introuvable` });
});

// JSON mal formé ou erreur inattendue
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erreur: 'JSON mal formé' });
  }
  console.error(err);
  res.status(500).json({ erreur: 'Erreur interne du serveur' });
});

app.listen(PORT, () => {
  console.log(`API démarrée sur http://localhost:${PORT}/produits`);
});
