const path = require('path');

class LabelGenerator {
  constructor() {
    this.allergens = require('../data/allergens.json');
    this.additives = require('../data/additives.json');
    this.displayRules = require('../data/display_rules.json');
    this.standardIngredients = require('../data/standard_ingredients.json');
  }

  isStandardIngredient(name) {
    const standards = this.standardIngredients['省略可能な複合原材料'];
    const normalizedName = name.toLowerCase();

    return Object.entries(standards).some(([key, data]) => {
      const allNames = [
        key.toLowerCase(),
        ...(data.alternatives || []).map(alt => alt.toLowerCase())
      ];
      return allNames.includes(normalizedName);
    });
  }

  getStandardIngredientInfo(name) {
    const standards = this.standardIngredients['省略可能な複合原材料'];
    const normalizedName = name.toLowerCase();

    for (const [key, data] of Object.entries(standards)) {
      const allNames = [
        key.toLowerCase(),
        ...(data.alternatives || []).map(alt => alt.toLowerCase())
      ];
      if (allNames.includes(normalizedName)) {
        return {
          name: key,
          ...data
        };
      }
    }
    return null;
  }

  shouldSkipCompoundDetails(ingredient, totalWeight) {
    // 標準的な複合原材料でない場合は省略しない
    if (!this.isStandardIngredient(ingredient.name)) {
      return false;
    }

    // 5%未満の場合のみ複合原材料の詳細を省略
    const percentage = (ingredient.weight / totalWeight) * 100;
    return percentage < this.standardIngredients.配合割合基準.省略可能割合;
  }

  extractMainIngredientsAndAdditives(text) {
    if (!text) return { mainIngredients: '', additives: [] };

    const parts = text.split(/[\/／]/).map(part => part.trim());
    return {
      mainIngredients: parts[0],
      additives: parts[1] ? this.extractAdditivesFromText(parts[1]) : []
    };
  }

  analyzeCompoundIngredient(details) {
    const result = {
      allergens: [],
      additives: []
    };

    if (!details) return result;

    const { mainIngredients, additives } = this.extractMainIngredientsAndAdditives(details);
    
    if (mainIngredients) {
      result.allergens = this.extractAllergensFromText(mainIngredients);
    }

    if (additives) {
      result.additives = additives;
    }

    return result;
  }

  extractAdditivesFromText(text) {
    if (!text) return [];

    const additiveParts = [];
    let currentPart = '';
    let bracketCount = 0;

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

        result.push(part);
      } else {
        if (!this.isSkippableAdditive(part)) {
          result.push(part);
        }
      }
    }

    Object.entries(compounds).forEach(([category, items]) => {
      if (items.length > 0) {
        result.push(`${category}(${items.join('、')})`);
      }
    });

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

      // 総重量を計算
      const totalWeight = ingredients.reduce((sum, ing) => sum + ing.weight, 0);

      // 原材料を重量順にソート
      const sortedIngredients = [...ingredients].sort((a, b) => b.weight - a.weight);

      // 表示用の原材料名リスト
      const displayIngredients = [];

      // 原材料の処理
      sortedIngredients.forEach(ing => {
        const isStandard = this.isStandardIngredient(ing.name);
        const skipDetails = this.shouldSkipCompoundDetails(ing, totalWeight);

        // アレルギー情報の収集
        if (isStandard) {
          const info = this.getStandardIngredientInfo(ing.name);
          info.contains_allergens.forEach(allergen => {
            if (this.isRequiredAllergen(allergen)) {
              mandatoryAllergens.add(allergen);
            } else {
              recommendedAllergens.add(allergen);
            }
          });
        }

        // 原材料表示の生成
        let ingredientDisplay = ing.name;

        // 複合原材料の詳細情報の処理
        if (ing.detailIngredients && !skipDetails) {
          const { mainIngredients, additives } = this.extractMainIngredientsAndAdditives(ing.detailIngredients);
          
          if (!isStandard) {
            // 標準的でない複合原材料は詳細を表示
            ingredientDisplay = `${ing.name}（${mainIngredients}）`;
          }
          
          // 添加物を収集
          additives.forEach(additive => allAdditives.add(additive));
        }

        // 原材料を表示リストに追加
        displayIngredients.push(ingredientDisplay);

        // 直接のアレルギー情報を検出
        const directAllergens = this.extractAllergensFromText(ing.name);
        directAllergens.forEach(allergen => {
          if (this.isRequiredAllergen(allergen)) {
            mandatoryAllergens.add(allergen);
          } else {
            recommendedAllergens.add(allergen);
          }
        });

        // 複合原材料からのアレルギー情報を検出
        if (ing.detailIngredients) {
          const analysis = this.analyzeCompoundIngredient(ing.detailIngredients);
          
          analysis.allergens.forEach(allergen => {
            if (this.isRequiredAllergen(allergen)) {
              mandatoryAllergens.add(allergen);
            } else {
              recommendedAllergens.add(allergen);
            }
          });

          // 添加物は常に収集
          if (analysis.additives) {
            analysis.additives.forEach(additive => allAdditives.add(additive));
          }
        }
      });

      // ラベル情報の生成
      label.名称 = productName;

      // 原料原産地表示
      const mainIngredient = sortedIngredients[0];
      if (mainIngredient && mainIngredient.origin && displayIngredients.length > 0) {
        displayIngredients[0] = `${displayIngredients[0]}（${mainIngredient.origin}製造）`;
      }

      // 原材料名を結合
      label.原材料名 = displayIngredients.join('、');

      // 添加物を最後にまとめて表示
      if (allAdditives.size > 0) {
        label.原材料名 += `／${Array.from(allAdditives).join('、')}`;
      }

      // アレルギー表示を追加
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
}

module.exports = LabelGenerator;
