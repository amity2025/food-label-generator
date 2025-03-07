const path = require('path');

class LabelGenerator {
  constructor() {
    this.allergens = require('../data/allergens.json');
    this.additives = require('../data/additives.json');
    this.displayRules = require('../data/display_rules.json');
    this.standardIngredients = require('../data/standard_ingredients.json');
  }

  extractAdditivesFromText(text) {
    if (!text) return [];

    const additiveParts = [];
    let currentPart = '';
    let bracketCount = 0;

    // 括弧の対応を考慮しながら分割
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '（' || char === '(') {
        bracketCount++;
        currentPart += char;
      } else if (char === '）' || char === ')') {
        bracketCount--;
        currentPart += char;
      } else if ((char === '、' || char === ',') && bracketCount === 0) {
        additiveParts.push(currentPart.trim());
        currentPart = '';
      } else {
        currentPart += char;
      }
    }
    if (currentPart) {
      additiveParts.push(currentPart.trim());
    }

    const result = [];
    const compounds = {
      甘味料: [],
      保存料: [],
      調味料: []
    };

    for (const part of additiveParts) {
      if (!part) continue;

      if (part === 'カラメル色素') {
        result.push('カラメル色素');
        continue;
      }

      const match = part.match(/^(.+?)[\(（](.+?)[\)）]$/);
      if (match) {
        const [, category, contents] = match;
        const name = category.trim();

        if (this.isSkippableAdditive(name)) continue;

        if (name in compounds) {
          compounds[name] = contents.split(/[、,]/).map(item => item.trim());
          continue;
        }

        if (name === '調味料' && contents === 'アミノ酸等') {
          result.push('調味料(アミノ酸等)');
          continue;
        }

        if (this.additives.一括名[name]) {
          result.push(part);
          continue;
        }

        result.push(part);
      } else {
        if (!this.isSkippableAdditive(part)) {
          if (this.additives.一括名[part]) {
            result.push(part);
          } else {
            result.push(part);
          }
        }
      }
    }

    Object.entries(compounds).forEach(([category, items]) => {
      if (items.length > 0) {
        result.push(`${category}(${items.join('、')})`);
      }
    });

    const orderedResult = [];
    const desiredOrder = ['カラメル色素', '調味料', '甘味料', '保存料'];

    desiredOrder.forEach(prefix => {
      const matching = result.find(item => item.startsWith(prefix));
      if (matching) {
        orderedResult.push(matching);
      }
    });

    result.forEach(item => {
      if (!orderedResult.includes(item)) {
        orderedResult.push(item);
      }
    });

    return orderedResult;
  }

  analyzeCompoundIngredient(details) {
    const result = {
      allergens: [],
      additives: []
    };

    const [mainPart, additivePart] = details.split(/[\/／]/).map(part => part.trim());
    
    if (mainPart) {
      result.allergens = this.extractAllergensFromText(mainPart);
    }

    if (additivePart) {
      result.additives = this.extractAdditivesFromText(additivePart);
    }

    return result;
  }

  extractAllergensFromText(text) {
    const allergens = new Set();
    const cleanText = text.toLowerCase();

    this.allergens['特定原材料（義務表示）'].forEach(allergen => {
      const searchTerms = [
        allergen.name.toLowerCase(),
        ...(allergen.alternatives || []).map(alt => alt.toLowerCase())
      ];
      if (searchTerms.some(term => cleanText.includes(term))) {
        allergens.add(allergen.name);
      }
    });

    this.allergens['特定原材料に準ずるもの（推奨表示対象品目）'].forEach(allergen => {
      const searchTerms = [
        allergen.name.toLowerCase(),
        ...(allergen.alternatives || []).map(alt => alt.toLowerCase())
      ];
      if (searchTerms.some(term => cleanText.includes(term))) {
        allergens.add(allergen.name);
      }
    });

    return Array.from(allergens).sort();
  }

  generateLabel(product) {
    try {
      const {
        productName,
        manufacturer,
        ingredients,
        netWeight,
        storageMethod,
        bestBefore
      } = product;

      const label = {};
      const mandatoryAllergens = new Set();
      const recommendedAllergens = new Set();
      const allAdditives = new Set();

      // 原材料を重量順にソート
      const sortedIngredients = [...ingredients].sort((a, b) => b.weight - a.weight);

      // 最も重量の多い原材料を特定
      const primaryIngredient = sortedIngredients[0];

      // 原材料の処理
      sortedIngredients.forEach(ing => {
        // 原材料名から直接アレルギー物質を検出
        const directAllergens = this.extractAllergensFromText(ing.name);
        directAllergens.forEach(allergen => {
          if (this.isRequiredAllergen(allergen)) {
            mandatoryAllergens.add(allergen);
          } else {
            recommendedAllergens.add(allergen);
          }
        });

        // 複合原材料の詳細情報からの検出
        if (ing.detailIngredients) {
          const analysis = this.analyzeCompoundIngredient(ing.detailIngredients);

          analysis.allergens.forEach(allergen => {
            if (this.isRequiredAllergen(allergen)) {
              mandatoryAllergens.add(allergen);
            } else {
              recommendedAllergens.add(allergen);
            }
          });

          if (analysis.additives && analysis.additives.length > 0) {
            analysis.additives.forEach(additive => {
              allAdditives.add(additive);
            });
          }
        }
      });

      // ラベル情報の生成
      label.名称 = productName;

      // 原材料名の生成（原料原産地表示を含む）
      const ingredientList = sortedIngredients.map((ing, index) => {
        if (index === 0 && ing.origin) {
          // 最も重量の多い原材料には原産地を表示
          return `${ing.name}（${ing.origin}製造）`;
        }
        return ing.name;
      });

      label.原材料名 = ingredientList.join('、');

      if (allAdditives.size > 0) {
        label.原材料名 += `／${Array.from(allAdditives).join('、')}`;
      }

      const allergenDisplay = [
        ...Array.from(mandatoryAllergens).sort(),
        ...Array.from(recommendedAllergens).sort()
      ];
      
      if (allergenDisplay.length > 0) {
        label.原材料名 += `（一部に${allergenDisplay.join('・')}を含む）`;
      }

      label.内容量 = this.formatWeight(netWeight);
      if (bestBefore) label.賞味期限 = bestBefore;
      if (storageMethod) label.保存方法 = storageMethod;
      label.製造者 = manufacturer;

      return label;
    } catch (error) {
      console.error('Label generation error:', error);
      throw error;
    }
  }

  formatWeight(weight) {
    const value = parseFloat(weight);
    if (isNaN(value)) return '0g';
    return value >= 1000 ? `${value/1000}kg` : `${value}g`;
  }

  isSkippableAdditive(name) {
    return Object.values(this.additives.省略可能).some(category => 
      category.例.includes(name)
    );
  }

  isRequiredAllergen(name) {
    return this.allergens['特定原材料（義務表示）'].some(
      allergen => allergen.name === name
    );
  }

  isCompoundIngredient(name) {
    return Object.keys(this.standardIngredients).some(key => 
      name.toLowerCase().includes(key.toLowerCase())
    );
  }
}

module.exports = LabelGenerator;
