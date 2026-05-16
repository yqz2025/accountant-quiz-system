// ... existing code ...

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

app.delete('/api/questions/clear', (req, res) => {
    try {
        db.run('DELETE FROM questions', [], function(err) {
            if (err) {
                console.error('清空题目失败:', err);
                return res.status(500).json({
                    success: false,
                    message: '清空失败',
                    error: err.message
                });
            }
            
            console.log(`✅ 已清空 ${this.changes} 道题目`);
            
            res.json({
                success: true,
                message: `已清空 ${this.changes} 道题目`
            });
        });
    } catch (error) {
        console.error('清空题目失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误',
            error: error.message
        });
    }
});

app.post('/api/questions/import', (req, res) => {
    try {
        const { questions } = req.body;
        
        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({
                success: false,
                message: '题目数据无效'
            });
        }

        let successCount = 0;
        let failCount = 0;
        const errors = [];

        const stmt = db.prepare(`
            INSERT INTO questions (paper, question_num, type, question, options, answer, explanation, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const now = new Date().toISOString();

        questions.forEach((q, index) => {
            try {
                const { paper, question_num, type, question, options, answer, explanation } = q;
                
                if (!paper || !question_num || !type || !question || !options || (answer === undefined || answer === null || answer === '')) {
                    failCount++;
                    errors.push(`题目 ${index + 1}: 缺少必填字段`);
                    return;
                }

                const optionsJson = JSON.stringify(options);
                let finalAnswer = answer;
                
                if (type === 'true_false' && typeof answer === 'boolean') {
                    finalAnswer = answer === true ? 'true' : 'false';
                }

                stmt.run(paper, question_num, type, question, optionsJson, finalAnswer, explanation || '', now, now);
                successCount++;
            } catch (err) {
                failCount++;
                errors.push(`题目 ${index + 1}: ${err.message}`);
            }
        });

        console.log(`✅ 批量导入完成: 成功 ${successCount} 道，失败 ${failCount} 道`);

        res.json({
            success: true,
            message: `成功导入 ${successCount} 道题目${failCount > 0 ? `，失败 ${failCount} 道` : ''}`,
            successCount,
            failCount,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error('批量导入失败:', error);
        res.status(500).json({
            success: false,
            message: '服务器错误',
            error: error.message
        });
    }
});

// ... existing code ...