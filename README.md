# Cabinet de lecture

Partage de fiches de lecture, de citations et de conseils (carnet de route), réservé aux membres.
Node.js 22 · Express · SQLite (better-sqlite3) · PDFKit · Nginx · systemd.

## Installation sur le VPS (Debian 12/13)

Depuis ton poste :

```bash
scp cabinet-lecture.zip utilisateur@IP_DU_VPS:/tmp/
ssh utilisateur@IP_DU_VPS
```

Sur le VPS :

```bash
sudo apt-get install -y unzip
cd /tmp && unzip -o cabinet-lecture.zip
cd cabinet-lecture
sudo bash deploy/install.sh tadj        # « tadj » = identifiant du premier administrateur
```

Le script installe Node 22, Nginx, crée l’utilisateur système `cabinet`, copie l’application dans
`/opt/cabinet-lecture`, installe les dépendances, active le service et la configuration Nginx, puis
affiche le code d’accès de l’administrateur. Le site répond sur `http://IP_DU_VPS/`.

Pare-feu (si `ufw` est utilisé) :

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw enable
```

## Configuration

`/opt/cabinet-lecture/.env` : nom du site, monogramme, port. Après modification :

```bash
sudo systemctl restart cabinet-lecture
```

## Exploitation

```bash
sudo systemctl status cabinet-lecture          # état
sudo journalctl -u cabinet-lecture -f          # journaux
cd /opt/cabinet-lecture && sudo -u cabinet node scripts/create-admin.js nom   # créer / réinitialiser un admin
```

## Mise à jour depuis GitHub

Le code vit dans un clone git sur le VPS (par exemple `~/tom-morel`), distinct du site en service
(`/opt/cabinet-lecture`). Première fois :

```bash
sudo apt-get install -y git
git clone https://github.com/lucienmorel/tom-morel.git ~/tom-morel
```

Ensuite, à chaque modification poussée sur GitHub :

```bash
cd ~/tom-morel && sudo bash MAJ.sh
```

`MAJ.sh` fait `git pull`, sauvegarde la base dans `data/sauvegardes/`, copie le code, réinstalle les
dépendances seulement si elles ont changé, redémarre le service et vérifie qu'il tourne. Il ne touche
ni à Nginx, ni au certificat HTTPS, ni à `.env`, ni à `data/`. En cas d'échec, il affiche les journaux
et la commande de retour à la version précédente.

Sauvegarde (base + fichiers) :

```bash
sudo -u cabinet sqlite3 /opt/cabinet-lecture/data/cabinet.db ".backup /opt/cabinet-lecture/data/sauvegarde.db"
sudo tar czf ~/cabinet-$(date +%F).tgz -C /opt/cabinet-lecture data
```

## Passage en HTTPS (plus tard)

1. Pointer un nom de domaine vers l’IP, remplacer `server_name _;` par ce nom dans
   `/etc/nginx/sites-available/cabinet-lecture`.
2. `sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d mon-domaine.fr`
3. Mettre `COOKIE_SECURE=1` dans `.env` puis redémarrer le service.

## Fonctionnement

- **Accès** : tout est derrière connexion. L’administrateur crée les comptes ; un code
  `XXXX-XXXX-XXXX` est généré et affiché une seule fois. Chacun peut ensuite changer son code.
- **Fiches** : ISBN (notice et couverture cherchées sur Open Library, puis Google Books, puis Amazon) ou saisie manuelle et dépôt
  d’image ; thème libre (réutilise un thème existant si le nom correspond) ; citations multiples.
  L’auteur d’une fiche et les administrateurs peuvent la modifier ou la supprimer.
- **Citations** : onglet dédié pour noter une citation sans fiche (titre obligatoire, auteur et
  page facultatifs) ; la liste regroupe aussi les citations des fiches. Le recueil PDF inclut les deux.
- **PDF** : fiche individuelle, recueil de toutes les citations, liste des titres par thème.
  Générés à la demande, ils reflètent toujours l’état courant de la base.
- **Règle du cercle** : affichée sur l’accueil, modifiable par les administrateurs
  (Administration → Règle du cercle). Un texte vide la masque.
- **Fausses bonnes idées** : liste des ouvrages déconseillés (titre, auteur et raison facultatifs),
  sans résumé ni citations.
- **Carnet de route** : conseils, organisation, retours d’expérience ; un texte, un PDF, ou les deux.
- **À avoir lu dans sa vie** : case à cocher sur une fiche ; étiquette sur la fiche et filtre dans la bibliothèque.
- **Descriptions des pages** : le texte en haut de chaque page est modifiable par les administrateurs
  (Administration → Descriptions des pages).
- **Administration** : comptes (création, nouveau code, suppression), thèmes (renommer,
  fusionner, supprimer), modération des fiches.

## Sécurité

Mots de passe en scrypt, sessions en base (cookie HttpOnly, SameSite=Lax), jeton CSRF sur tous
les formulaires, limitation des tentatives de connexion (10 / 15 min / IP), CSP stricte sans
script ni style inline, contrôle du type réel des fichiers déposés (octets magiques), fichiers
servis uniquement aux personnes connectées, service systemd confiné (`ProtectSystem=strict`).

## Développement local

```bash
npm install
cp .env.example .env
node scripts/create-admin.js admin
npm run dev        # http://127.0.0.1:3000
```
