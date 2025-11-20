const multer = require('multer');
const fs = require('fs');
const path = require('path');

const IMAGENES_FOLDER = path.join(__dirname, '..', 'uploads', 'imagenes');

if (!fs.existsSync(IMAGENES_FOLDER)) {
    fs.mkdirSync(IMAGENES_FOLDER, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, IMAGENES_FOLDER);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (
        allowedExtensions.includes(ext) ||
        file.mimetype.startsWith('image/')
    ) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten imágenes de perfil'), false);
    }
};

const upload = multer({ storage: storage, fileFilter: fileFilter });

module.exports = upload;