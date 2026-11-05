# Agent d'impression — PC atelier

Petit programme Node qui relie la **file d'impression** de l'outil de suivi à
**Epson Edge Print** :

1. pendant les heures d'atelier, il demande au serveur les transferts à imprimer
   (jeton dédié, sans mot de passe) ;
2. il télécharge chaque visuel et le dépose dans le **dossier surveillé** d'Edge Print
   de l'imprimante choisie (1 ou 2), découpé selon les réglages rapides disponibles
   (ex. 12 transferts = 1 fichier dans le dossier « ×10 » + 2 fichiers dans le dossier « ×1 ») ;
3. il lit **sans la modifier** la base d'Edge Print (sur une copie) : dès qu'un travail est
   imprimé, seul ou dans une imbrication, il le signale. La commande passe en
   « Impression OK » quand toutes ses lignes sont imprimées.

Les transferts à l'unité d'une même commande arrivent **déjà regroupés en rangées** : un
PDF de plusieurs pages par rangée (10 transferts au plus, dans la largeur du papier), déposé
dans le dossier « ×1 ». Edge Print traite un PDF de plusieurs pages comme un travail imbriqué :
les pages se placent côte à côte, il ne reste qu'à lancer l'impression. Un fichier qui ne peut
pas être regroupé (image, PDF abîmé ou de plusieurs pages) part seul, et un transfert unique
garde son fichier d'origine.

Les fichiers déposés portent un nom lisible et un marqueur, par exemple
`2026-0138 104HE-22 Mug Je t'aime x10 [EDK57-3f9a1c-1].pdf` : le marqueur
`[EDK57-3f9a1c-1]` (envoi 57, début du lot, fichier 1) permet de retrouver le travail
dans Edge Print, sans jamais le confondre avec un ancien travail. Une rangée s'appelle
`2026-0162 Rangée 1 sur 5 [EDK142-3f9a1c-R1].pdf`.

## Prérequis

- Windows et Node.js 22.13 ou plus récent (24 recommandé). Aucune dépendance à installer :
  `vendor/` contient le module PDF [pdf-lib](https://pdf-lib.js.org) 1.17.1 (licence MIT).
- Dans Edge Print, pour chaque imprimante : un dossier surveillé par réglage rapide utilisé
  (ex. « MUG » à 10 exemplaires et « MUG x1 » à 1 exemplaire), **impression automatique
  désactivée** : on vérifie, on imbrique et on lance depuis Edge Print.
- Le dossier de travail de l'agent et les dossiers surveillés sur le **même disque** (dépôt d'un coup).

## Configuration

Copier `config.exemple.json` en `config.json`. Ce fichier contient le jeton : il ne va
**jamais** dans le dépôt (il est ignoré par Git).

| Champ | Rôle |
|---|---|
| `serveur` | adresse de l'outil de suivi |
| `jeton` | la valeur de `IMPRESSION_AGENT_TOKEN` (variable d'environnement Vercel) |
| `poste` | nom affiché dans l'outil (« PC atelier ») |
| `intervalleSecondes` | délai entre deux passages (15 s par défaut) |
| `intervalleEdgePrintSecondes` | délai minimum entre deux lectures de la base d'Edge Print (60 s par défaut) |
| `heuresActives` | jours (0 = dimanche) et heures de travail de l'agent. En dehors, il ne contacte pas le serveur : la base de données peut s'endormir. |
| `edgePrintDb` | base d'Edge Print (lue sur une copie, jamais modifiée) |
| `rangees` | facultatif : `parRangee` (10), `largeurUtileMm` (1100), `ecartMm` (10). `false` revient au dépôt fichier par fichier. |
| `imprimantes.A` / `.B` | imprimantes affichées « Imprimante 1 » et « Imprimante 2 » dans l'outil : libellé, et dossiers surveillés avec le nombre d'exemplaires de leur réglage rapide. Un dossier `"copies": 1` est obligatoire. |

Dans un fichier JSON, chaque `\` d'un chemin Windows s'écrit `\\`.

## Installer sur le PC atelier

```bash
powershell -ExecutionPolicy Bypass -File installer.ps1
```

Le script copie le programme dans `%USERPROFILE%\Ecodeko\agent-impression`, où doit se
trouver `config.json`, et crée la tâche Windows « Ecodeko Agent Impression » qui lance
l'agent sans fenêtre à l'ouverture de session. Il suffit de le relancer pour mettre
l'agent à jour : `config.json` et `journal.json` sont conservés.

## Lancer à la main

- Un seul passage (essai) : `npm.cmd run une-fois`
- En continu : `npm.cmd start`
- Une autre configuration : `node agent.js --config C:\chemin\config.json`

À côté de `config.json` : `agent.log` (journal d'activité) et `journal.json` (dépôts déjà
faits, pour ne jamais déposer deux fois le même envoi, même après un redémarrage).

## Sécurité

- Le jeton ne donne accès qu'à la file d'impression (`/api/agent/impression/*`) : les visuels
  en cours d'impression et leur état. Il ne permet ni de voir ni de modifier le reste de l'outil.
- Si le jeton a fuité : en générer un nouveau, le remplacer sur Vercel puis dans `config.json`.
