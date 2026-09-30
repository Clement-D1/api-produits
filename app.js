const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;

// Clé secrète servant à signer les jetons.
// En production, elle doit venir d'une variable d'environnement, jamais du code.
const JWT_SECRET = process.env.JWT_SECRET || 'change-moi-cle-secrete-de-dev';
const JWT_EXPIRATION = '5m';

app.use(express.json());

// ---------------------------------------------------------------------------
// Utilisateurs (en mémoire). Les mots de passe sont stockés hachés, jamais en clair.
// ---------------------------------------------------------------------------
const utilisateurs = [
  { id: 1, identifiant: 'admin', motDePasseHache: bcrypt.hashSync('admin123', 10) },
];

// ---------------------------------------------------------------------------
// Produits (en mémoire, remis à zéro à chaque redémarrage)
// ---------------------------------------------------------------------------
let produits = [
  { id: 1, nom: 'Clavier mécanique', description: 'Clavier AZERTY, switches rouges', prix: 89.99, categorie: 'Informatique' },
  { id: 2, nom: 'Gourde isotherme', description: 'Gourde inox 750 ml', prix: 19.9, categorie: 'Sport' },
];
let prochainId = 3;

const CHAMPS = ['nom', 'description', 'prix', 'categorie'];

// ---------------------------------------------------------------------------
// Validation des produits
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
// Middleware d'authentification
// Attend l'en-tête : Authorization: Bearer <jeton>
// ---------------------------------------------------------------------------
function authentifier(req, res, next) {
  const entete = req.headers.authorization || '';
  const [type, jeton] = entete.split(' ');

  if (type !== 'Bearer' || !jeton) {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ erreur: 'Jeton d\'accès manquant' });
  }

  try {
    const contenu = jwt.verify(jeton, JWT_SECRET, { algorithms: ['HS256'] });
    req.utilisateur = { id: contenu.sub, identifiant: contenu.identifiant };
    next();
  } catch (err) {
    res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ erreur: 'Jeton expiré, reconnectez-vous' });
    }
    return res.status(401).json({ erreur: 'Jeton invalide' });
  }
}

// ---------------------------------------------------------------------------
// Authentification : génère un jeton valable 5 minutes
// ---------------------------------------------------------------------------
app.post('/auth/login', (req, res) => {
  const { identifiant, motDePasse } = req.body || {};

  if (typeof identifiant !== 'string' || typeof motDePasse !== 'string' || !identifiant || !motDePasse) {
    return res.status(400).json({ erreur: 'Les champs "identifiant" et "motDePasse" sont obligatoires' });
  }

  const utilisateur = utilisateurs.find((u) => u.identifiant === identifiant);

  // Même message que l'identifiant ou le mot de passe soit faux :
  // on ne révèle pas quels comptes existent.
  if (!utilisateur || !bcrypt.compareSync(motDePasse, utilisateur.motDePasseHache)) {
    return res.status(401).json({ erreur: 'Identifiant ou mot de passe incorrect' });
  }

  const jeton = jwt.sign(
    { sub: utilisateur.id, identifiant: utilisateur.identifiant },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRATION, algorithm: 'HS256' }
  );

  res.status(200).json({
    jeton,
    type: 'Bearer',
    expireDans: 300, // secondes
  });
});

// ---------------------------------------------------------------------------
// Routes produits
// Lecture : publique. Écriture : protégée par authentifier.
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

// Ajouter (protégé)
app.post('/produits', authentifier, (req, res) => {
  const erreurs = valider(req.body);
  if (erreurs.length > 0) {
    return res.status(400).json({ erreurs });
  }

  const { nom, description, prix, categorie } = req.body;
  const produit = { id: prochainId++, nom, description, prix, categorie };
  produits.push(produit);

  res.status(201).location(`/produits/${produit.id}`).json(produit);
});

// Remplacer (protégé) : tous les champs obligatoires
app.put('/produits/:id', authentifier, trouverProduit, (req, res) => {
  const erreurs = valider(req.body);
  if (erreurs.length > 0) {
    return res.status(400).json({ erreurs });
  }

  const { nom, description, prix, categorie } = req.body;
  const id = produits[req.indexProduit].id;
  produits[req.indexProduit] = { id, nom, description, prix, categorie };

  res.status(200).json(produits[req.indexProduit]);
});

// Modifier (protégé) : seuls les champs envoyés changent
app.patch('/produits/:id', authentifier, trouverProduit, (req, res) => {
  const erreurs = valider(req.body, true);
  if (erreurs.length > 0) {
    return res.status(400).json({ erreurs });
  }

  produits[req.indexProduit] = { ...produits[req.indexProduit], ...req.body };

  res.status(200).json(produits[req.indexProduit]);
});

// Supprimer (protégé)
app.delete('/produits/:id', authentifier, trouverProduit, (req, res) => {
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
  console.log(`API démarrée sur http://localhost:${PORT}`);
});
