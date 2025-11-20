const multer = require('multer');
const fs = require('fs');
const path = require('path');

const UPLOADS_FOLDER = path.join(__dirname, '..', 'uploads', 'publicaciones');

if (!fs.existsSync(UPLOADS_FOLDER)) {
    fs.mkdirSync(UPLOADS_FOLDER, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOADS_FOLDER);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

// Permitir imágenes, pdf, txt, código fuente y archivos comprimidos
const allowedExtensions = [
    // Imágenes
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    // Documentos
    '.pdf', '.txt',
    // Código fuente
    '.js', '.py', '.java', '.cpp', '.c', '.cs', '.rb', '.php', '.go', '.ts', '.swift', '.kt', '.rs', '.scala', '.sh', '.bat', '.pl', '.html', '.css', '.json', '.xml', '.sql', '.dart', '.m', '.r', '.jl', '.lua',
    // Comprimidos
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'
];

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
        allowedExtensions.includes(ext) ||
        file.mimetype.startsWith('image/') ||
        file.mimetype === 'application/pdf' ||
        file.mimetype === 'text/plain' ||
        file.mimetype.startsWith('text/') ||
        file.mimetype === 'application/octet-stream' ||
        // Comprimidos por mimetype
        file.mimetype === 'application/zip' ||
        file.mimetype === 'application/x-zip-compressed' ||
        file.mimetype === 'application/x-rar-compressed' ||
        file.mimetype === 'application/x-7z-compressed' ||
        file.mimetype === 'application/x-tar' ||
        file.mimetype === 'application/gzip' ||
        file.mimetype === 'application/x-bzip2' ||
        file.mimetype === 'application/x-xz'
    ) {
        cb(null, true);
    } else {
        cb(new Error('Tipo de archivo no permitido'), false);
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

module.exports = upload;