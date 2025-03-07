const LabelGenerator = require('../core/LabelGenerator');

describe('LabelGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new LabelGenerator();
  });

  describe('複合原材料の解析', () => {
    test('醤油の詳細情報から正しくアレルギーと添加物を検出', () => {
      const details = 'アミノ酸液、脱脂加工大豆、小麦、食塩、粉飴、氷糖蜜／カラメル色素、調味料(アミノ酸等)、甘味料(ステビア、甘草)、アルコール、保存料(パラオキシ安息香酸、安息香酸Na)';
      
      const result = generator.analyzeCompoundIngredient(details);
      
      // アレルギー検出の確認
      expect(result.allergens).toContain('小麦');
      expect(result.allergens).toContain('大豆');
      
      // 添加物検出の確認
      expect(result.additives).toContain('カラメル色素');
      expect(result.additives).toContain('調味料(アミノ酸等)');
      expect(result.additives).toContain('甘味料(ステビア、甘草)');
      expect(result.additives).toContain('保存料(パラオキシ安息香酸、安息香酸Na)');
      
      // 製造用アルコールは省略されることを確認
      expect(result.additives).not.toContain('アルコール');
    });

    test('みりんの詳細情報から正しく解析', () => {
      const details = 'もち米、米こうじ、醸造アルコール、糖類／調味料(アミノ酸等)';
      
      const result = generator.analyzeCompoundIngredient(details);
      
      // アレルギー物質がないことを確認
      expect(result.allergens).toHaveLength(0);
      
      // 添加物の確認
      expect(result.additives).toContain('調味料(アミノ酸等)');
    });
  });

  describe('食品表示ラベル生成', () => {
    test('複合原材料を含む製品のラベル生成', () => {
      const product = {
        productName: "煮物",
        manufacturer: "テスト食品株式会社",
        ingredients: [
          {
            name: "大根",
            weight: 50,
            origin: "国内"
          },
          {
            name: "醤油",
            weight: 20,
            detailIngredients: "アミノ酸液、脱脂加工大豆、小麦、食塩／カラメル色素、調味料(アミノ酸等)"
          },
          {
            name: "砂糖",
            weight: 15
          }
        ],
        netWeight: 100,
        storageMethod: "要冷蔵（10℃以下）",
        bestBefore: "2024-03-01"
      };

      const label = generator.generateLabel(product);

      // 原材料表示の確認（重量順）
      expect(label.原材料名).toMatch(/^大根（国内製造）/);  // 最も多い原材料に原産地表示
      expect(label.原材料名).toMatch(/大根（国内製造）.*?醤油/);  // 重量順の確認
      expect(label.原材料名).toMatch(/醤油.*?砂糖/);  // 重量順の確認

      // 添加物表示の確認
      expect(label.原材料名).toContain('／カラメル色素、調味料(アミノ酸等)');

      // アレルギー表示の確認
      expect(label.原材料名).toContain('（一部に小麦・大豆を含む）');
    });

    test('原料原産地表示の生成', () => {
      const product = {
        productName: "サラダ",
        manufacturer: "テスト食品株式会社",
        ingredients: [
          {
            name: "キャベツ",
            weight: 100,
            origin: "国内"
          },
          {
            name: "にんじん",
            weight: 30,
            origin: "国産"
          }
        ],
        netWeight: 130,
        storageMethod: "要冷蔵（10℃以下）",
        bestBefore: "2024-03-01"
      };

      const label = generator.generateLabel(product);

      // 最も重量の多い原材料のみに原産地表示があることを確認
      expect(label.原材料名).toMatch(/^キャベツ（国内製造）/);
      expect(label.原材料名).not.toMatch(/にんじん（国産製造）/);
    });
  });

  describe('アレルギー物質の検出', () => {
    test('特定原材料（義務表示）の検出', () => {
      const text = '小麦粉、卵、乳製品、えび';
      const allergens = generator.extractAllergensFromText(text);
      
      expect(allergens).toContain('小麦');
      expect(allergens).toContain('卵');
      expect(allergens).toContain('乳');
      expect(allergens).toContain('えび');
    });

    test('特定原材料に準ずるもの（推奨表示）の検出', () => {
      const text = '大豆油、りんご、ごま油';
      const allergens = generator.extractAllergensFromText(text);
      
      expect(allergens).toContain('大豆');
      expect(allergens).toContain('りんご');
      expect(allergens).toContain('ごま');
    });

    test('代替表記の検出', () => {
      const text = '玉子、落花生（ピーナッツ）、海老';
      const allergens = generator.extractAllergensFromText(text);
      
      expect(allergens).toContain('卵');
      expect(allergens).toContain('落花生');
      expect(allergens).toContain('えび');
    });
  });

  describe('添加物の解析', () => {
    test('用途名併記が必要な添加物の処理', () => {
      const text = 'カラメル色素、調味料(アミノ酸等)、甘味料(ステビア)';
      const additives = generator.extractAdditivesFromText(text);
      
      expect(additives).toContain('カラメル色素');
      expect(additives).toContain('調味料(アミノ酸等)');
      expect(additives).toContain('甘味料(ステビア)');
    });

    test('省略可能な添加物の除外', () => {
      const text = 'カラメル色素、アルコール、pH調整剤';
      const additives = generator.extractAdditivesFromText(text);
      
      expect(additives).toContain('カラメル色素');
      expect(additives).not.toContain('アルコール');
      expect(additives).toContain('pH調整剤');
    });
  });
});