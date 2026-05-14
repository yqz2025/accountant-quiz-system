const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database('./quiz.db');

console.log('📖 读取题目数据...');

const questionsPath = path.join(__dirname, 'data', 'questions.js');
let fileContent = fs.readFileSync(questionsPath, 'utf-8');
const match = fileContent.match(/window\.questionsData\s*=\s*(\[[\s\S]*\])/);

if (!match) {
    console.error('❌ 无法解析题目数据');
    process.exit(1);
}

const questions = JSON.parse(match[1]);
console.log(`✓ 共读取 ${questions.length} 道题目`);

console.log('🗑️  清空现有题目数据...');
db.exec('DELETE FROM questions');

console.log('📝 开始导入题目...');

const insertStmt = db.prepare(`
    INSERT INTO questions (paper, question_num, type, question, options, answer, explanation, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const now = new Date().toISOString();
let successCount = 0;

const transaction = db.transaction((questions) => {
    for (const q of questions) {
        try {
            const optionsJson = JSON.stringify(q.options);
            insertStmt.run(
                q.paper,
                q.question_num,
                q.type,
                q.question,
                optionsJson,
                q.answer,
                q.explanation || '',
                now,
                now
            );
            successCount++;
        } catch (err) {
            console.error(`导入第 ${q.question_num} 题失败:`, err.message);
        }
    }
});

transaction(questions);

console.log(`✅ 导入完成！成功导入 ${successCount}/${questions.length} 道题目`);
console.log('💾 数据已保存到 quiz.db');

db.close();