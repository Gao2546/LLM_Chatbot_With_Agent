// TypeScript version of the Express.js file API
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from "dotenv";
import { exec } from 'child_process';
import os from "os";
import si from "systeminformation";
import screenshot from "screenshot-desktop";
import { mouse, keyboard, Point, Key } from "@nut-tree-fork/nut-js"; // นำเข้า nut.js
import google, { search } from 'googlethis';
// import { search, SafeSearchType } from 'duck-duck-scrape';
import { chromium } from 'playwright';
import TurndownService from 'turndown';
import { time } from 'console';
import { getJson } from "serpapi";

dotenv.config()

const APP_SERVER_URL = process.env.APP_SERVER || 'http://localhost:3000'

console.log(`CORS configured for: ${APP_SERVER_URL}`);

const app = express();
app.use(express.json());
const PORT = 3333;

app.use(cors({
  origin: APP_SERVER_URL,
  credentials: true
}));

let BASE_DIR = process.cwd();

app.use(bodyParser.json());

type ApiResponseData = Record<string, any> | null;

const _apiResponse = (res: Response, data: ApiResponseData, message = '', status = 200): void => {
  // console.log(data);
  let content : { 
    type: string;
    text: string;
  }[] = [];
  if (data && typeof data === 'object') {
    if (data.files || data.content || data.lines || data.new_path || data.full_path || data.items || data.result || data.results || (data.os && data.system_hardware && data.current_directory && data.time)) {
      let defind_data;

      if (data.files !== undefined) defind_data = data.files;
      else if (data.content !== undefined) defind_data = data.content;
      else if (data.lines !== undefined) defind_data = data.lines;
      else if (data.new_path !== undefined) defind_data = data.new_path;
      else if (data.full_path !== undefined) defind_data = data.full_path;
      else if (data.items !== undefined) defind_data = data;
      else if (data.result !== undefined) defind_data = data.result;
      else if (data.results !== undefined) defind_data = data.results;
      else if ((data.os !== undefined) && (data.system_hardware !== undefined)) defind_data = data;

      content = [{ type: 'string', text: JSON.stringify(defind_data, null, 2) }];
    } else {
      content = [{ type: 'string', text: message}];
    }
  } else {
    content = [{ type: 'string', text: message}];
  }
  res.status(status).json({ content });
};

const _getFullPath = (filePath: string): string => {
  const targetPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(BASE_DIR, filePath);
  return path.normalize(targetPath);
};

// ==========================================
// SYSTEM & INFO TOOLS
// ==========================================

app.get("/system/info", async (_req: Request, res: Response) => {
  try {
    const osExtra = await si.osInfo();
    const cpu = await si.cpu();
    const mem = await si.mem();
    const gpu = await si.graphics();
    const now = new Date();

    const systemSummary = {
      os: `${osExtra.distro} ${osExtra.release} (${os.arch()})`,
      system_hardware: {
        cpu: `${cpu.manufacturer} ${cpu.brand} (${cpu.cores} cores)`,
        memory: `${(mem.total / (1024 ** 3)).toFixed(1)} GB RAM`,
        gpus: gpu.controllers.length > 0 ? gpu.controllers.map(g => `${g.vendor} ${g.model}`).join(", ") : "N/A"
      },
      current_directory: process.cwd(),
      time: { local_time: now.toLocaleString(), time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone }
    };

    return _apiResponse(res, systemSummary, "System summary retrieved successfully");
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

// ==========================================
// WEB & UI AUTOMATION TOOLS (NEW)
// ==========================================

// WebSearch Tool
app.post('/system/search', async (req: Request, res: Response) => {
  try {
    const { search_query } = req.body;
    if (!search_query) return _apiResponse(res, null, 'Missing search_query', 400);


    const response = await getJson({
                        engine: "google",
                        q: search_query,
                        location: "Bangkok, Thailand",
                        google_domain: "google.co.th",
                        hl: "th",
                        gl: "th",
                        api_key: process.env.SERPAPI_KEY!
                      }, (json) => {
                        console.log(json);
                      }) as {search_metadata: Object, search_parameters: Object, search_information: Object,inline_videos: Object[],ai_overview: Object, organic_results: Object[], related_searches: Object[], refine_this_search: Object[],knowledge_graph: Object, pagination: Object, serpapi_pagination: Object};



    const Final_response = {origin_result: response.organic_results, 
      inline_videos: response.inline_videos, 
      ai_overview: response.ai_overview, 
      related_searches: response.related_searches, 
      knowledge_graph: response.knowledge_graph, 
      pagination: response.pagination,
    }
    console.log("Google Search Response:", Final_response);
    // ส่งผลลัพธ์กลับไปที่ Client แทนการเปิด Browser
    return _apiResponse(res, { results: Final_response }, 'Search success');
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

// app.post('/system/search', async (req: Request, res: Response) => {
//   try {
//     const { search_query } = req.body;
//     if (!search_query) return _apiResponse(res, null, 'Missing search_query', 400);

//     // ดึงผลลัพธ์การค้นหา
//     const options = {
//       page: 0,
//       safe: false, 
//       parse_ads: false, 
//     };

//     const response = await google.search(search_query, options);
//     console.log("Google Search Response:", response);
//     // ส่งผลลัพธ์กลับไปที่ Client แทนการเปิด Browser
//     return _apiResponse(res, { results: response.results }, 'Search success');
//   } catch (err: any) {
//     return _apiResponse(res, null, err.message, 500);
//   }
// });

// app.post('/system/search', async (req: Request, res: Response) => {
//   try {
//     const { search_query } = req.body;
//     if (!search_query) return _apiResponse(res, null, 'Missing search_query', 400);

//     // ดึงผลลัพธ์การค้นหาจาก DuckDuckGo
//     const searchResults = await search(search_query, 
//       // {
//       //   safeSearch: SafeSearchType.OFF // หรือใช้ SafeSearchType.STRICT / MODERATE
//       // }
//   );

//     console.log(`Found ${searchResults.results.length} results from DuckDuckGo`);

//     // ส่งผลลัพธ์กลับไปที่ Client
//     return _apiResponse(res, { 
//       results: searchResults.results 
//     }, 'Search success');

//   } catch (err: any) {
//     console.error("Scraper Error:", err);
//     return _apiResponse(res, null, err.message, 500);
//   }
// });

// OpenURL Tool
app.post('/system/open', (req: Request, res: Response) => {
  try {
    const { target_url } = req.body;
    if (!target_url) return _apiResponse(res, null, 'Missing target_url', 400);

    const openCmd = process.platform === 'win32' ? `start "" "${target_url}"` : process.platform === 'darwin' ? `open "${target_url}"` : `xdg-open "${target_url}"`;
    
    exec(openCmd);
    return _apiResponse(res, { content: `Opened URL: ${target_url}` }, `Browser opened with target URL`);
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

// WebScraper Tool
app.post('/system/scrape', async (req: Request, res: Response) => {
  try {
    const { url, method } = req.body;
    if (!url) return _apiResponse(res, null, 'Missing url parameter', 400);

    const browser = await chromium.launch({ headless: false }); // เปิดเบราว์เซอร์แบบไม่ซ่อนหน้าต่าง
    const page = await browser.newPage();
    
    // networkidle ensures the page has fully loaded its dynamic content
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 24*60*60*1000 });

    if (method === 'screenshot') {
      const imgBuffer = await page.screenshot({ fullPage: true });
      await browser.close();
      
      // Sending back in the expected format for your agent
      return res.status(200).json({
        content: [
          { type: 'string', text: `Successfully captured screenshot of ${url}` },
          { type: 'resource_data', text: imgBuffer.toString('base64') }
        ]
      });
    } else {
      // Extract HTML and convert to Markdown
      const html = await page.content();
      await browser.close();
      
      const turndownService = new TurndownService({ headingStyle: 'atx' });
      // Removes scripts and styles from the markdown output
      turndownService.remove(['script', 'style', 'noscript']); 
      
      const markdown = turndownService.turndown(html);
      return _apiResponse(res, { content: markdown }, `Scraped text from ${url}`);
    }
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

// TakeScreenshot Tool
app.post('/system/screenshot', async (req: Request, res: Response) => {
  console.log('Received request to take a screenshot...');
  try {
    const { target_application } = req.body; 
    
    const imgBuffer = await screenshot();
    res.set('Content-Type', 'image/png');
    res.send(imgBuffer);
    console.log(`Screenshot sent successfully! (Target: ${target_application || 'full_screen'})`);
  } catch (err: any) {
    console.error('An error occurred:', err);
    res.status(500).send({ error: 'Failed to take screenshot' });
  }
});

// ClickCoordinates Tool (Updated to nut.js and async)
app.post('/system/click', async (req: Request, res: Response) => {
  try {
    const { x_coordinate, y_coordinate } = req.body;
    if (x_coordinate == null || y_coordinate == null) return _apiResponse(res, null, 'Missing coordinates', 400);

    // เลื่อนเมาส์ไปยังตำแหน่งและคลิกซ้าย
    await mouse.setPosition(new Point(Number(x_coordinate), Number(y_coordinate)));
    await mouse.leftClick();

    return _apiResponse(res, { content: `Clicked at X:${x_coordinate}, Y:${y_coordinate}` }, `Mouse clicked successfully`);
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

// TypeKeys Tool (Updated to nut.js and async)
app.post('/system/type', async (req: Request, res: Response) => {
  try {
    const { key_sequence } = req.body;
    if (!key_sequence) return _apiResponse(res, null, 'Missing key_sequence', 400);

    // nut.js รองรับการพิมพ์ string ปกติ และการกดปุ่มพิเศษ (Key.XXX)
    if (key_sequence.toLowerCase() === "enter") {
      await keyboard.type(Key.Enter);
    } else {
      await keyboard.type(key_sequence);
    }

    return _apiResponse(res, { content: `Typed: ${key_sequence}` }, `Keys typed successfully`);
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

// ==========================================
// FILE & SYSTEM MANAGEMENT TOOLS
// ==========================================

app.post('/files/change_dir', (req: Request, res: Response) => {
  try {
    const { target_path } = req.body;
    if (!target_path) return _apiResponse(res, null, 'Missing target_path', 400);

    const resolvedPath = path.resolve(BASE_DIR, target_path);
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      return _apiResponse(res, null, 'Directory does not exist', 404);
    }

    BASE_DIR = resolvedPath;
    process.chdir(resolvedPath);
    return _apiResponse(res, null, `Working directory changed to '${BASE_DIR}'`);
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

app.get('/files/list', (_req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(BASE_DIR);
    return _apiResponse(res, { files:`list file \n${files}` }, 'Successfully listed files.');
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

app.post('/files/read', (req: Request, res: Response) => {
  try {
    const { file_path, start_line, end_line } = req.body;
    if (!file_path) return _apiResponse(res, null, "Missing 'file_path'", 400);

    const fullPath = _getFullPath(file_path);
    if (!fs.existsSync(fullPath)) return _apiResponse(res, null, 'File not found', 404);

    const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');

    let selectedLines: string[];
    if (start_line != null && end_line != null) {
      selectedLines = lines.slice(start_line - 1, end_line);
    } else if (end_line != null) {
      selectedLines = lines.slice(0, end_line);
    } else {
      selectedLines = lines;
    }

    const numberedLines = selectedLines.map((line, idx) => `line ${start_line != null ? start_line + idx : idx + 1}: ${line}`);
    const msg = start_line != null && end_line != null ? `Read lines ${start_line}-${end_line}` : `Read all content from '${file_path}'`;

    return _apiResponse(res, { content: numberedLines.join('\n') }, msg);
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

app.post('/files/edit', (req: Request, res: Response) => {
  try {
    const { file_path, content_to_insert, text, start_line, end_line } = req.body;
    const finalContent = content_to_insert || text; // รองรับทั้งสองชื่อ

    const fullPath = _getFullPath(file_path);
    if (!fs.existsSync(fullPath)) return _apiResponse(res, null, 'File not found', 404);

    const lines = fs.readFileSync(fullPath, 'utf-8').split('\n');

    if (start_line != null && end_line != null) {
      lines.splice(start_line - 1, end_line - start_line + 1, finalContent);
      fs.writeFileSync(fullPath, lines.join('\n'));
    } else {
      fs.writeFileSync(fullPath, finalContent);
    }

    const updatedLines = fs.readFileSync(fullPath, 'utf-8').split('\n');
    const numberedLines = updatedLines.map((line, idx) => `line ${idx + 1}: ${line}`);

    return _apiResponse(res, { content: numberedLines.join('\n') }, `Edited file '${file_path}'`);
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

app.post('/files/create', (req: Request, res: Response) => {
  try {
    const { file_path, file_content, text } = req.body;
    const finalContent = file_content || text;
    if (!file_path) return _apiResponse(res, null, 'Missing file_path', 400);

    const fullPath = _getFullPath(file_path);
    if (finalContent != null) {
        fs.writeFileSync(fullPath, finalContent);
        const updatedLines = fs.readFileSync(fullPath, 'utf-8').split('\n');
        const numberedLines = updatedLines.map((line, idx) => `line ${idx + 1}: ${line}`);
        return _apiResponse(res, { content: numberedLines.join('\n') }, `Created file '${file_path}' with text`, 201);
    } else {
      if (fs.existsSync(fullPath)) return _apiResponse(res, null, 'File already exists', 409);
      fs.writeFileSync(fullPath, '');
      return _apiResponse(res, { content: "" }, `Created empty file '${file_path}'`, 201);
    }
  } catch (err: any) {
      return _apiResponse(res, null, err.message, 500);
  }
});

app.post('/files/delete', (req: Request, res: Response) => {
  try {
    const { file_path } = req.body;
    if (!file_path) return _apiResponse(res, null, 'Missing file_path', 400);

    const fullPath = _getFullPath(file_path);
    if (!fs.existsSync(fullPath)) return _apiResponse(res, null, 'File not found', 404);

    fs.unlinkSync(fullPath);
    _apiResponse(res, null, `Deleted file '${file_path}'`);
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

// Download File
app.post('/files/download', async (req: Request, res: Response) => {
  try {
    const { source_url, destination_path } = req.body;
    if (!source_url || !destination_path) return _apiResponse(res, null, 'Missing source_url or destination_path', 400);

    const fullPath = _getFullPath(destination_path);
    
    const response = await fetch(source_url);
    if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(fullPath, buffer);

    return _apiResponse(res, { content: `Downloaded file to ${destination_path}` }, `Download successful`);
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

app.post('/files/create_folder', (req: Request, res: Response) => {
  try {
    const { directory_path } = req.body;
    if (!directory_path) return _apiResponse(res, null, 'Missing directory_path', 400);

    const folderPath = path.resolve(BASE_DIR, directory_path);
    if (fs.existsSync(folderPath)) return _apiResponse(res, null, 'Folder already exists', 409);

    fs.mkdirSync(folderPath);
    _apiResponse(res, null, `Created folder '${directory_path}'`, 201);
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

app.post('/files/CMD', (req: Request, res: Response) => {
  let responded = false;
  try {
    const { command_string, working_directory, wait_for_completion, wait } = req.body;
    const finalWait = wait_for_completion || wait || 'False'; // ใช้ค่า 'False' หากไม่ได้ระบุ
    if (!command_string) return _apiResponse(res, null, 'Missing command_string', 400);

    if (finalWait === 'False'){
      setTimeout(() => {
        if (!responded) {
          responded = true;
          return _apiResponse(res, { content: "" }, `Executed command async: '${command_string}'`);
        }
      }, 3000);
    }

    const targetDir = working_directory ? path.resolve(BASE_DIR, working_directory) : BASE_DIR;

    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      return _apiResponse(res, null, 'Target directory does not exist', 404);
    }

    exec(command_string, { cwd: targetDir }, (error, stdout, stderr) => {
      if (responded) return;
      responded = true;
      if (error) return _apiResponse(res, null, `Error: ${stderr || error.message}`, 500);

      return _apiResponse(res, { content: stdout }, `Executed command in '${targetDir}' complete`);
    });
  } catch (err: any) {
      if (!responded) return _apiResponse(res, null, err.message, 500);
  }
});

app.get('/files/CurrentDirectory', (_req: Request, res: Response) => {
  try {
    return _apiResponse(res, { content:`current directory is : ${process.cwd()}` }, 'Successfully retrieved current directory.');
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

// Get full file path
app.post('/files/get_full_path', (req: Request, res: Response) => {
  try {
    const { file_name } = req.body;
    if (!file_name) return _apiResponse(res, null, 'Missing file_name', 400);

    const fullPath = _getFullPath(file_name);
    if (!fs.existsSync(fullPath)) return _apiResponse(res, null, 'File not found', 404);

    return _apiResponse(res, { full_path: fullPath }, `Full path for '${file_name}' retrieved successfully`);
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

// Browse directory
app.post('/files/browse', (req: Request, res: Response) => {
  const { directory } = req.body;
  const targetDir = directory ? path.resolve(BASE_DIR, directory) : BASE_DIR;
  
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    return _apiResponse(res, null, 'Directory does not exist', 404);
  }

  try {
    const items = fs.readdirSync(targetDir);
    const itemsWithDetails = items.map(item => {
      const itemPath = path.join(targetDir, item);
      const stats = fs.statSync(itemPath);
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
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return _apiResponse(res, { 
      current_directory: targetDir,
      parent_directory: path.dirname(targetDir),
      items: itemsWithDetails 
    }, `Directory contents for '${targetDir}' retrieved successfully`);
  } catch (err: any) {
    return _apiResponse(res, null, err.message, 500);
  }
});

// Ping
app.get('/ping' , (_req: Request, res: Response) => {
  res.status(200).send('pong');
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));