const express = require('express');
const path = require('path');
const LabelGenerator = require('./core/LabelGenerator');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

// 複合原材料のチェック
app.post('/api/check-ingredient', (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            throw new Error('原材料名が指定されていません');
        }

        const generator = new LabelGenerator();
        const isCompound = generator.isCompoundIngredient(name);

        res.json({
            status: 'success',
            data: {
                isCompound
            }
        });
    } catch (error) {
        console.error('Error checking ingredient:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// 複合原材料の分析
app.post('/api/analyze-compound', (req, res) => {
    try {
        const { details } = req.body;
        if (!details) {
            throw new Error('複合原材料の詳細が指定されていません');
        }

        const generator = new LabelGenerator();
        const analysis = generator.analyzeCompoundIngredient(details);

        res.json({
            status: 'success',
            data: analysis
        });
    } catch (error) {
        console.error('Error analyzing compound ingredient:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ラベル生成
app.post('/api/generate-label', (req, res) => {
    try {
        const generator = new LabelGenerator();
        const label = generator.generateLabel(req.body);
        res.json({
            status: 'success',
            data: label
        });
    } catch (error) {
        console.error('Error generating label:', error);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

app.listen(port, () => {
    console.log('食品表示生成サーバーが起動しました - ポート', port);
});