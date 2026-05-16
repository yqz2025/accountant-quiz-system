const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123456';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'quiz.db');

// 安全中间件
app.use(helmet());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    maxAge: 86400
}));
app.use(compression());

// 中间件
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error('数据库连接失败:', err.message);
    } else {
        console.log('✓ 数据库连接成功');
    }
});

db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');
db.run('PRAGMA cache_size = -16000');
db.run('PRAGMA temp_store = MEMORY');

db.exec(`
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        className TEXT NOT NULL,
        major TEXT NOT NULL,
        registerTime TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS test_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentId INTEGER NOT NULL,
        studentName TEXT NOT NULL,
        className TEXT NOT NULL,
        major TEXT NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        duration TEXT NOT NULL,
        score INTEGER NOT NULL,
        totalScore INTEGER DEFAULT 30,
        submitTime TEXT NOT NULL,
        FOREIGN KEY (studentId) REFERENCES students(id)
    );
    
    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paper TEXT NOT NULL,
        question_num INTEGER NOT NULL,
        type TEXT NOT NULL,
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        answer TEXT NOT NULL,
        explanation TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
`, (err) => {
    if (err) {
        console.error('创建表失败:', err.message);
    }
});

// API 路由 - 用户注册
app.post('/api/register', (req, res) => {
    try {
        const { name, className, major } = req.body;
        
        if (!name || !className || !major) {
            return res.json({
                success: false,
                msg: '请填写完整信息'
            });
        }

        const registerTime = new Date().toISOString();
        
        db.run('INSERT INTO students (name, className, major, registerTime) VALUES (?, ?, ?, ?)', 
            [name, className, major, registerTime],
            function(err) {
                if (err) {
                    console.error('注册失败:', err);
                    return res.status(500).json({
                        success: false,
                        msg: '服务器错误'
                    });
                }
                
                const newStudent = {
                    id: this.lastID,
                    name,
                    className,
                    major,
                    registerTime
                };
                
                console.log(`✅ 新用户注册: ${name} (${className} - ${major})`);
                
                res.json({
                    success: true,
                    msg: '注册成功',
                    student: newStudent
                });
            }
        );
    } catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({
            success: false,
            msg: '服务器错误'
        });
    }
});

// API 路由 - 保存测试成绩
app.post('/api/save-score', (req, res) => {
    try {
        const { studentId, studentName, className, major, startTime, endTime, duration, score } = req.body;
        
        // 检查必要字段（studentId 和 score 可以是数字或字符串）
        if (!studentId && studentId !== 0) {
            console.error('❌ studentId 为空');
            return res.json({
                success: false,
                msg: '缺少 studentId'
            });
        }
        
        if (!startTime) {
            console.error('❌ startTime 为空');
            return res.json({
                success: false,
                msg: '缺少 startTime'
            });
        }
        
        if (!endTime) {
            console.error('❌ endTime 为空');
            return res.json({
                success: false,
                msg: '缺少 endTime'
            });
        }
        
        if (score === null || score === undefined || score === '') {
            console.error('❌ score 为空');
            return res.json({
                success: false,
                msg: '缺少 score'
            });
        }

        const submitTime = new Date().toISOString();
        
        // 确保 score 是数字
        const scoreNum = parseInt(score);
        
        const stmt = db.prepare(`
            INSERT INTO test_records 
            (studentId, studentName, className, major, startTime, endTime, duration, score, submitTime) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(studentId, studentName, className, major, startTime, endTime, duration, scoreNum, submitTime);
        
        console.log(`✅ 成绩已保存: ${studentName} - ${scoreNum}分`);
        
        res.json({
            success: true,
            msg: '成绩已保存'
        });
    } catch (error) {
        console.error('保存成绩失败:', error);
        res.status(500).json({
            success: false,
            msg: '服务器错误: ' + error.message
        });
    }
});

// API 路由 - 获取所有测试记录
app.get('/api/test-records', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM test_records ORDER BY submitTime DESC');
        const rows = stmt.all();
        
        res.json({
            success: true,
            data: rows,
            total: rows.length
        });
    } catch (error) {
        console.error('查询失败:', error);
        res.status(500).json({
            success: false,
            msg: '查询失败'
        });
    }
});

// API 路由 - 删除测试记录
app.delete('/api/test-records/:id', (req, res) => {
    try {
        const { id } = req.params;
        
        const stmt = db.prepare('DELETE FROM test_records WHERE id = ?');
        const result = stmt.run(id);
        
        if (result.changes === 0) {
            return res.json({
                success: false,
                msg: '记录不存在'
            });
        }
        
        console.log(`✅ 已删除测试记录 ID: ${id}`);
        
        res.json({
            success: true,
            msg: '删除成功'
        });
    } catch (error) {
        console.error('删除失败:', error);
        res.status(500).json({
            success: false,
            msg: '删除失败: ' + error.message
        });
    }
});

// API 路由 - 导出 Excel
app.get('/api/export-excel', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM test_records ORDER BY submitTime DESC');
        const rows = stmt.all();
        
        // 转换数据格式
        const excelData = rows.map(row => ({
            '序号': row.id,
            '姓名': row.studentName,
            '班级': row.className,
            '专业部门': row.major,
            '开始时间': new Date(row.startTime).toLocaleString('zh-CN'),
            '结束时间': new Date(row.endTime).toLocaleString('zh-CN'),
            '测试用时': row.duration,
            '得分': row.score,
            '满分': row.totalScore,
            '提交时间': new Date(row.submitTime).toLocaleString('zh-CN')
        }));
        
        // 创建工作簿
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);
        
        // 设置列宽
        ws['!cols'] = [
            { wch: 8 },
            { wch: 15 },
            { wch: 20 },
            { wch: 15 },
            { wch: 20 },
            { wch: 20 },
            { wch: 15 },
            { wch: 10 },
            { wch: 10 },
            { wch: 20 }
        ];
        
        XLSX.utils.book_append_sheet(wb, ws, '测试成绩');
        
        // 生成 Excel 文件
        const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        // 设置响应头 - 使用 URL 编码处理中文文件名
        const filename = `quiz_scores_${new Date().toISOString().slice(0,10)}.xlsx`;
        const encodedFilename = encodeURIComponent(filename);
        
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`
        );
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        
        res.send(excelBuffer);
    } catch (error) {
        console.error('导出失败:', error);
        res.status(500).json({
            success: false,
            msg: '导出失败'
        });
    }
});

// API 路由 - 获取题目数据
app.get('/api/questions', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM questions ORDER BY paper, question_num');
        const rows = stmt.all();
        
        const questions = rows.map(row => ({
            ...row,
            options: JSON.parse(row.options)
        }));
        
        res.json({
            success: true,
            data: questions,
            total: questions.length
        });
    } catch (error) {
        console.error('获取题目数据失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误',
            error: error.message
        });
    }
});

// API 路由 - 获取单个题目（必须在 /:type 之前）
app.get('/api/questions/detail/:id', (req, res) => {
    try {
        const { id } = req.params;
        const stmt = db.prepare('SELECT * FROM questions WHERE id = ?');
        const row = stmt.get(id);
        
        if (!row) {
            return res.status(404).json({
                success: false,
                message: '题目不存在'
            });
        }
        
        const question = {
            ...row,
            options: JSON.parse(row.options)
        };
        
        res.json({
            success: true,
            data: question
        });
    } catch (error) {
        console.error('获取题目详情失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误',
            error: error.message
        });
    }
});

// API 路由 - 按题型获取题目（必须放在具体路由之后）
app.get('/api/questions/:type', (req, res) => {
    try {
        const { type } = req.params;
        const validTypes = ['single_choice', 'multiple_choice', 'true_false'];
        
        if (!validTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: '无效的题目类型'
            });
        }

        const stmt = db.prepare('SELECT * FROM questions WHERE type = ? ORDER BY paper, question_num');
        const rows = stmt.all(type);
        
        const questions = rows.map(row => ({
            ...row,
            options: JSON.parse(row.options)
        }));
        
        res.json({
            success: true,
            data: questions,
            total: questions.length,
            type: type
        });
    } catch (error) {
        console.error('获取题目失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误',
            error: error.message
        });
    }
});

// API 路由 - 创建题目
app.post('/api/questions', (req, res) => {
    try {
        const { paper, question_num, type, question, options, answer, explanation } = req.body;
        
        // 修复验证逻辑：判断题的 answer 是布尔值 false 时，!answer 也会为 true
        if (!paper || !question_num || !type || !question || !options || (answer === undefined || answer === null || answer === '')) {
            return res.status(400).json({
                success: false,
                message: '请填写完整的题目信息'
            });
        }

        const now = new Date().toISOString();
        const optionsJson = JSON.stringify(options);
        
        // 处理答案：判断题的 answer 可能是布尔值，需要转换为字符串
        let finalAnswer = answer;
        if (type === 'true_false' && typeof answer === 'boolean') {
            finalAnswer = answer === true ? 'true' : 'false';
        }
        
        const stmt = db.prepare(`
            INSERT INTO questions (paper, question_num, type, question, options, answer, explanation, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt.run(paper, question_num, type, question, optionsJson, finalAnswer, explanation || '', now, now);
        
        console.log(`✅ 新增题目 ID: ${result.lastInsertRowid}`);
        
        res.json({
            success: true,
            message: '题目添加成功',
            id: result.lastInsertRowid
        });
    } catch (error) {
        console.error('创建题目失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误',
            error: error.message
        });
    }
});

// API 路由 - 更新题目
app.put('/api/questions/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { paper, question_num, type, question, options, answer, explanation } = req.body;
        
        // 修复验证逻辑
        if (!paper || !question_num || !type || !question || !options || (answer === undefined || answer === null || answer === '')) {
            return res.status(400).json({
                success: false,
                message: '请填写完整的题目信息'
            });
        }

        const now = new Date().toISOString();
        const optionsJson = JSON.stringify(options);
        
        // 处理答案：判断题的 answer 可能是布尔值
        let finalAnswer = answer;
        if (type === 'true_false' && typeof answer === 'boolean') {
            finalAnswer = answer === true ? 'true' : 'false';
        }
        
        const stmt = db.prepare(`
            UPDATE questions 
            SET paper = ?, question_num = ?, type = ?, question = ?, options = ?, answer = ?, explanation = ?, updatedAt = ?
            WHERE id = ?
        `);
        
        const result = stmt.run(paper, question_num, type, question, optionsJson, finalAnswer, explanation || '', now, id);
        
        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: '题目不存在'
            });
        }
        
        console.log(`✅ 更新题目 ID: ${id}`);
        
        res.json({
            success: true,
            message: '题目更新成功'
        });
    } catch (error) {
        console.error('更新题目失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误',
            error: error.message
        });
    }
});

// API 路由 - 删除题目
app.delete('/api/questions/:id', (req, res) => {
    try {
        const { id } = req.params;
        
        const stmt = db.prepare('DELETE FROM questions WHERE id = ?');
        const result = stmt.run(id);
        
        if (result.changes === 0) {
            return res.status(404).json({
                success: false,
                message: '题目不存在'
            });
        }
        
        console.log(`✅ 删除题目 ID: ${id}`);
        
        res.json({
            success: true,
            message: '题目删除成功'
        });
    } catch (error) {
        console.error('删除题目失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误',
            error: error.message
        });
    }
});

// API 路由 - 管理员密码验证
app.post('/api/admin/verify', (req, res) => {
    try {
        const { password } = req.body;
        
        if (password === ADMIN_PASSWORD) {
            res.json({ success: true });
        } else {
            res.json({ success: false });
        }
    } catch (error) {
        console.error('密码验证失败:', error);
        res.status(500).json({ success: false });
    }
});

// 健康检查接口
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// 主页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// 练习模式页面
app.get('/practice', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'example-test.html'));
});

// 注册页面
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// 测试模式页面（需要先注册）
app.get('/test', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'random-test.html'));
});

// 数据管理页面
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 题目管理页面
app.get('/question-admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'question-admin.html'));
});

// 404 处理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        msg: '接口不存在'
    });
});

// 全局错误处理
app.use((err, req, res, next) => {
    console.error('服务器错误:', err.message);
    
    if (NODE_ENV === 'production') {
        res.status(500).json({
            success: false,
            msg: '服务器内部错误'
        });
    } else {
        res.status(500).json({
            success: false,
            msg: err.message
        });
    }
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 会计答题系统已启动`);
    console.log(`📍 访问地址: http://47.86.234.112:${PORT}`);
    console.log(` 练习模式: http://47.86.234.112:${PORT}/practice`);
    console.log(`📋 注册页面: http://47.86.234.112:${PORT}/register`);
    console.log(`🎯 测试模式: http://47.86.234.112:${PORT}/test`);
    console.log(`📊 数据管理: http://47.86.234.112:${PORT}/admin`);
    console.log(`📚 题目管理: http://47.86.234.112:${PORT}/question-admin`);
    console.log(`🔍 健康检查: http://47.86.234.112:${PORT}/health`);
    console.log(` 环境: ${NODE_ENV}`);
});