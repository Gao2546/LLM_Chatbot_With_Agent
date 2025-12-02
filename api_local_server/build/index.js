"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// TypeScript version of the Express.js file API
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const child_process_1 = require("child_process");
const os_1 = __importDefault(require("os"));
const systeminformation_1 = __importDefault(require("systeminformation"));
const screenshot_desktop_1 = __importDefault(require("screenshot-desktop"));
dotenv_1.default.config();
const APP_SERVER_URL = process.env.APP_SERVER || 'http://localhost:3000';
console.log(APP_SERVER_URL);
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = 3333;
// app.use(cors({
//   origin: APP_SERVER_URL,
//   credentials: true
// }));
app.use((0, cors_1.default)()); // Allows all origins
// let BASE_DIR = path.join(__dirname, 'managed_files');
// if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR);
// let BASE_DIR = "/app/files";
let BASE_DIR = process.cwd();
app.use(body_parser_1.default.json());
const _apiResponse = (res, data, message = '', status = 200) => {
    // const content = [{ type: 'string', text: message }];
    console.log(data);
    let content = [];
    if (data && typeof data === 'object') {
        if (data.files || data.content || data.lines || data.new_path || data.full_path || data.items || (data.os && data.system_hardware && data.current_directory && data.time)) {
            let defind_data;
            if (data.files !== undefined) {
                defind_data = data.files;
            }
            else if (data.content !== undefined) {
                defind_data = data.content;
            }
            else if (data.lines !== undefined) {
                defind_data = data.lines;
            }
            else if (data.new_path !== undefined) {
                defind_data = data.new_path;
            }
            else if (data.full_path !== undefined) {
                defind_data = data.full_path;
            }
            else if (data.items !== undefined) {
                defind_data = data;
            }
            else if ((data.os !== undefined) && (data.system_hardware !== undefined) && (data.current_directory !== undefined) && (data.time !== undefined)) {
                defind_data = data;
            }
            content = [{ type: 'string', text: JSON.stringify(defind_data, null, 2) }];
            // content.push({ type: 'string', text: JSON.stringify(data, null, 2) });
        }
        else {
            content = [{ type: 'string', text: message }];
        }
    }
    else {
        content = [{ type: 'string', text: message }];
    }
    res.status(status).json({ content });
};
const _getFullPath = (fileName) => {
    const targetPath = path_1.default.isAbsolute(fileName)
        ? fileName
        : path_1.default.join(BASE_DIR, fileName);
    return path_1.default.normalize(targetPath);
};
// Get system info API
app.get("/system/info", async (_req, res) => {
    try {
        // OS info (summary)
        const osExtra = await systeminformation_1.default.osInfo();
        // Hardware summary
        const cpu = await systeminformation_1.default.cpu();
        const mem = await systeminformation_1.default.mem();
        const gpu = await systeminformation_1.default.graphics();
        // Time info
        const now = new Date();
        const localTime = now.toLocaleString();
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const locale = Intl.DateTimeFormat().resolvedOptions().locale;
        // Build summary
        const systemSummary = {
            os: `${osExtra.distro} ${osExtra.release} (${os_1.default.arch()})`,
            system_hardware: {
                cpu: `${cpu.manufacturer} ${cpu.brand} (${cpu.cores} cores)`,
                memory: `${(mem.total / (1024 ** 3)).toFixed(1)} GB RAM`,
                gpus: gpu.controllers.length > 0
                    ? gpu.controllers.map(g => `${g.vendor} ${g.model}`).join(", ")
                    : "N/A"
            },
            current_directory: process.cwd(),
            time: {
                local_time: localTime,
                time_zone: timeZone,
                region: locale
            }
        };
        return _apiResponse(res, systemSummary, "System summary retrieved successfully");
    }
    catch (err) {
        return _apiResponse(res, null, err.message, 500);
    }
});
// Change working directory
app.post('/files/change_dir', (req, res) => {
    try {
        const { new_path } = req.body;
        if (!new_path)
            return _apiResponse(res, null, 'Missing new_path', 400);
        const resolvedPath = path_1.default.resolve(BASE_DIR, new_path);
        if (!fs_1.default.existsSync(resolvedPath) || !fs_1.default.statSync(resolvedPath).isDirectory()) {
            return _apiResponse(res, null, 'Directory does not exist', 404);
        }
        BASE_DIR = resolvedPath;
        process.chdir(resolvedPath);
        return _apiResponse(res, null, `Working directory changed to '${BASE_DIR}'`);
    }
    catch (err) {
        return _apiResponse(res, null, err.message, 500);
    }
});
// List files
app.get('/files/list', (_req, res) => {
    try {
        const files = fs_1.default.readdirSync(BASE_DIR);
        return _apiResponse(res, { files: `list file \n${files}` }, 'Successfully listed files.');
    }
    catch (err) {
        return _apiResponse(res, null, err.message, 500);
    }
});
// Read file
app.post('/files/read', (req, res) => {
    try {
        const { file_name, start_line, end_line } = req.body;
        if (!file_name)
            return _apiResponse(res, null, "Missing 'file_name'", 400);
        const fullPath = _getFullPath(file_name);
        if (!fs_1.default.existsSync(fullPath))
            return _apiResponse(res, null, 'File not found', 404);
        const lines = fs_1.default.readFileSync(fullPath, 'utf-8').split('\n');
        // Prepare the subset of lines
        let selectedLines;
        if (start_line != null && end_line != null) {
            selectedLines = lines.slice(start_line - 1, end_line);
        }
        else if (end_line != null) {
            selectedLines = lines.slice(0, end_line);
        }
        else {
            selectedLines = lines;
        }
        // Prefix each line with line number
        const numberedLines = selectedLines.map((line, idx) => {
            // Adjust line number according to start_line if provided
            const lineNumber = start_line != null ? start_line + idx : idx + 1;
            return `line ${lineNumber}: ${line}`;
        });
        return _apiResponse(res, { content: numberedLines.join('\n') }, start_line != null && end_line != null
            ? `Read lines ${start_line}-${end_line}`
            : end_line != null
                ? `Read up to line ${end_line}`
                : `Read all content from '${file_name}'`);
    }
    catch (err) {
        return _apiResponse(res, null, err.message, 500);
    }
});
// Edit file
app.post('/files/edit', (req, res) => {
    try {
        const { file_name, text, start_line, end_line } = req.body;
        if (!file_name || text == null)
            return _apiResponse(res, null, 'Missing fields', 400);
        const fullPath = _getFullPath(file_name);
        if (!fs_1.default.existsSync(fullPath))
            return _apiResponse(res, null, 'File not found', 404);
        const lines = fs_1.default.readFileSync(fullPath, 'utf-8').split('\n');
        if (start_line != null && end_line != null) {
            lines.splice(start_line - 1, end_line - start_line + 1, text);
            fs_1.default.writeFileSync(fullPath, lines.join('\n'));
        }
        else {
            fs_1.default.writeFileSync(fullPath, text);
        }
        // Read the updated file and format with line numbers
        const updatedLines = fs_1.default.readFileSync(fullPath, 'utf-8').split('\n');
        const numberedLines = updatedLines.map((line, idx) => `line ${idx + 1}: ${line}`);
        const message = start_line != null && end_line != null
            ? `Edited lines ${start_line}-${end_line}`
            : `Overwritten file '${file_name}'`;
        return _apiResponse(res, { content: numberedLines.join('\n') }, message);
    }
    catch (err) {
        return _apiResponse(res, null, err.message, 500);
    }
});
// Create file
app.post('/files/create', (req, res) => {
    try {
        console.log("create file====================");
        const { file_name, text } = req.body;
        if (!file_name)
            return _apiResponse(res, null, 'Missing file_name', 400);
        const fullPath = _getFullPath(file_name);
        if (text != null) {
            fs_1.default.writeFileSync(fullPath, text);
            console.log(fullPath);
            // Read the created file and format with line numbers
            const updatedLines = fs_1.default.readFileSync(fullPath, 'utf-8').split('\n');
            const numberedLines = updatedLines.map((line, idx) => `line ${idx + 1}: ${line}`);
            return _apiResponse(res, { content: numberedLines.join('\n') }, `Created file '${file_name}' with text`, 201);
        }
        else {
            if (fs_1.default.existsSync(fullPath))
                return _apiResponse(res, null, 'File already exists', 409);
            fs_1.default.writeFileSync(fullPath, '');
            // Read the created file and format with line numbers
            const updatedLines = fs_1.default.readFileSync(fullPath, 'utf-8').split('\n');
            const numberedLines = updatedLines.map((line, idx) => `line ${idx + 1}: ${line}`);
            return _apiResponse(res, { content: numberedLines.join('\n') }, `Created empty file '${file_name}'`, 201);
        }
    }
    catch (err) {
        return _apiResponse(res, null, `Error creating file: ${err.message}`, 500);
    }
});
// Delete file
app.post('/files/delete', (req, res) => {
    try {
        const { file_name } = req.body;
        if (!file_name)
            return _apiResponse(res, null, 'Missing file_name', 400);
        const fullPath = _getFullPath(file_name);
        if (!fs_1.default.existsSync(fullPath))
            return _apiResponse(res, null, 'File not found', 404);
        fs_1.default.unlinkSync(fullPath);
        _apiResponse(res, null, `Deleted file '${file_name}'`);
    }
    catch (err) {
        return _apiResponse(res, null, err.message, 500);
    }
});
// Download file
app.post('/files/download', (req, res) => {
    try {
        const { file_name } = req.body;
        if (!file_name)
            return _apiResponse(res, null, 'Missing file_name', 400);
        const fullPath = _getFullPath(file_name);
        if (!fs_1.default.existsSync(fullPath))
            return _apiResponse(res, null, 'File not found', 404);
        res.download(fullPath);
    }
    catch (err) {
        // This might not catch all download errors if they happen asynchronously
        return _apiResponse(res, null, err.message, 500);
    }
});
// Create folder
app.post('/files/create_folder', (req, res) => {
    try {
        const { folder_name } = req.body;
        if (!folder_name)
            return _apiResponse(res, null, 'Missing folder_name', 400);
        const folderPath = path_1.default.resolve(BASE_DIR, folder_name);
        if (fs_1.default.existsSync(folderPath))
            return _apiResponse(res, null, 'Folder already exists', 409);
        fs_1.default.mkdirSync(folderPath);
        _apiResponse(res, null, `Created folder '${folder_name}'`, 201);
    }
    catch (err) {
        return _apiResponse(res, null, err.message, 500);
    }
});
app.get('/ping', (req, res) => {
    console.log('pong');
    res.status(200).send('pong');
});
// Execute shell command
app.post('/files/CMD', (req, res) => {
    let responded = false;
    try {
        const { command, directory, wait } = req.body;
        if (wait == 'False') {
            setTimeout(() => {
                if (!responded) {
                    responded = true;
                    return _apiResponse(res, { content: "" }, `Executed command in '${directory}': '${command}' complete`);
                }
            }, 3000);
        }
        if (!command) {
            return _apiResponse(res, null, 'Missing command', 400);
        }
        // Resolve directory: if provided, use it; else fallback to BASE_DIR
        const targetDir = directory
            ? path_1.default.resolve(BASE_DIR, directory)
            : BASE_DIR;
        if (!fs_1.default.existsSync(targetDir) || !fs_1.default.statSync(targetDir).isDirectory()) {
            return _apiResponse(res, null, 'Target directory does not exist', 404);
        }
        (0, child_process_1.exec)(command, { cwd: targetDir }, (error, stdout, stderr) => {
            if (responded)
                return; // Prevent sending a response twice
            if (error) {
                responded = true;
                return _apiResponse(res, null, `Error: ${stderr || error.message}`, 500);
            }
            responded = true;
            if (stdout.length >= 0) {
                return _apiResponse(res, { content: stdout }, `Executed command in '${targetDir}': '${command}' complete`);
            }
            else {
                return _apiResponse(res, null, `Executed command in '${targetDir}': '${command}' complete`);
            }
        });
    }
    catch (err) {
        if (!responded) {
            return _apiResponse(res, null, err.message, 500);
        }
    }
});
// CurrentDirectory
app.get('/files/CurrentDirectory', (_req, res) => {
    try {
        const CurrentDirectory = process.cwd();
        return _apiResponse(res, { content: `current directory is : ${CurrentDirectory}` }, 'Successfully listed files.');
    }
    catch (err) {
        return _apiResponse(res, null, err.message, 500);
    }
});
// Get full file path
app.post('/files/get_full_path', (req, res) => {
    try {
        const { file_name } = req.body;
        if (!file_name)
            return _apiResponse(res, null, 'Missing file_name', 400);
        const fullPath = _getFullPath(file_name);
        if (!fs_1.default.existsSync(fullPath))
            return _apiResponse(res, null, 'File not found', 404);
        return _apiResponse(res, { full_path: fullPath }, `Full path for '${file_name}' retrieved successfully`);
    }
    catch (err) {
        return _apiResponse(res, null, err.message, 500);
    }
});
// Browse directory
app.post('/files/browse', (req, res) => {
    const { directory } = req.body;
    const targetDir = directory ? path_1.default.resolve(BASE_DIR, directory) : BASE_DIR;
    if (!fs_1.default.existsSync(targetDir) || !fs_1.default.statSync(targetDir).isDirectory()) {
        return _apiResponse(res, null, 'Directory does not exist', 404);
    }
    try {
        const items = fs_1.default.readdirSync(targetDir);
        const itemsWithDetails = items.map(item => {
            const itemPath = path_1.default.join(targetDir, item);
            const stats = fs_1.default.statSync(itemPath);
            return {
                name: item,
                path: itemPath,
                isDirectory: stats.isDirectory(),
                size: stats.size,
                modified: stats.mtime
            };
        });
        // Sort directories first, then files
        itemsWithDetails.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory)
                return -1;
            if (!a.isDirectory && b.isDirectory)
                return 1;
            return a.name.localeCompare(b.name);
        });
        return _apiResponse(res, {
            current_directory: targetDir,
            parent_directory: path_1.default.dirname(targetDir),
            items: itemsWithDetails
        }, `Directory contents for '${targetDir}' retrieved successfully`);
    }
    catch (err) {
        return _apiResponse(res, null, err.message, 500);
    }
});
app.get('/system/screenshot', async (req, res) => {
    console.log('Received request to take a screenshot...');
    try {
        // Call screenshot() without a filename to get the image as a buffer
        const imgBuffer = await (0, screenshot_desktop_1.default)();
        console.log(imgBuffer);
        console.log(imgBuffer.length);
        // Set the proper content type for the response
        res.set('Content-Type', 'image/png');
        // Send the image buffer back to the client
        res.send(imgBuffer);
        console.log('Screenshot sent successfully!');
    }
    catch (err) {
        console.error('An error occurred:', err);
        res.status(500).send({ error: 'Failed to take screenshot' });
    }
});
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
