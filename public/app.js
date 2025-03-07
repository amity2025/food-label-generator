let ingredients = [];
let pendingIngredient = null;

function addIngredient() {
  const nameInput = document.querySelector('.ingredient-name');
  const weightInput = document.querySelector('.ingredient-weight');
  const detailsArea = document.getElementById('compound-details');

  const name = nameInput.value.trim();
  const weight = parseFloat(weightInput.value);

  if (!name || !weight) {
    alert('原材料名と重量を入力してください');
    return;
  }

  // 複合原材料の場合、詳細が必要
  if (pendingIngredient && pendingIngredient.needsDetails && !detailsArea.value.trim()) {
    alert('複合原材料の詳細を入力してください');
    return;
  }

  const ingredient = {
    name,
    weight,
    detailIngredients: detailsArea.value.trim() || null
  };

  ingredients.push(ingredient);
  updateIngredientsList();
  clearInputs();
}

function findMaxWeightIngredient() {
  return ingredients.reduce((max, current) => 
    current.weight > (max?.weight || 0) ? current : max
  , null);
}

function clearInputs() {
  document.querySelector('.ingredient-name').value = '';
  document.querySelector('.ingredient-weight').value = '';
  document.getElementById('compound-details').value = '';
  hideCompoundInput();
  pendingIngredient = null;
}

function removeIngredient(index) {
  ingredients.splice(index, 1);
  updateIngredientsList();
}

function updateIngredientsList() {
  const list = document.getElementById('ingredients-list');
  list.innerHTML = '<h3>入力済み原材料（重量順）</h3>';

  // 重量順にソート
  const sortedIngredients = [...ingredients].sort((a, b) => b.weight - a.weight);

  sortedIngredients.forEach((ing, index) => {
    const item = document.createElement('div');
    item.className = 'ingredient-item';
    
    let content = `
      <div class="ingredient-info">
        <span>${ing.name} (${ing.weight}g)</span>
    `;

    if (ing.origin) {
      content += `<div class="ingredient-origin-display">(${ing.origin}製造)</div>`;
    }

    if (ing.detailIngredients) {
      content += `
        <div class="details">
          詳細: ${ing.detailIngredients}
        </div>
      `;
    }

    content += `</div>
      <button onclick="removeIngredient(${ingredients.indexOf(ing)})">削除</button>
    `;

    item.innerHTML = content;
    list.appendChild(item);
  });
}

async function checkIngredient(input) {
  const name = input.value.trim();
  if (!name) return;

  try {
    const response = await fetch('/api/check-ingredient', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });

    const result = await response.json();
    if (result.status === 'success' && result.data.isCompound) {
      pendingIngredient = { name, needsDetails: true };
      showCompoundInput();
    } else {
      hideCompoundInput();
      pendingIngredient = null;
    }
  } catch (error) {
    console.error('Error checking ingredient:', error);
  }
}

function showCompoundInput() {
  document.getElementById('compound-input').style.display = 'block';
}

function hideCompoundInput() {
  document.getElementById('compound-input').style.display = 'none';
}

function showOriginDialog(ingredient) {
  const modal = document.getElementById('origin-modal');
  const message = document.getElementById('origin-message');
  const input = document.getElementById('origin-input');

  message.textContent = `
    以下の原材料が最も使用量が多いため、原産地の入力が必要です：
    ${ingredient.name}（${ingredient.weight}g）
  `;
  modal.style.display = 'block';
  input.value = '';
  input.focus();
}

let pendingLabelGeneration = null;

function confirmOrigin() {
  const input = document.getElementById('origin-input');
  const origin = input.value.trim();

  if (!origin) {
    alert('原産地を入力してください');
    return;
  }

  const maxWeightIngredient = findMaxWeightIngredient();
  if (maxWeightIngredient) {
    maxWeightIngredient.origin = origin;
    updateIngredientsList();
  }

  document.getElementById('origin-modal').style.display = 'none';

  // 保留中のラベル生成があれば実行
  if (pendingLabelGeneration) {
    const productData = pendingLabelGeneration;
    pendingLabelGeneration = null;
    generateLabelInternal(productData);
  }
}

async function generateLabel() {
  if (ingredients.length === 0) {
    alert('原材料を入力してください');
    return;
  }

  const productData = {
    productName: document.getElementById('productName').value,
    manufacturer: document.getElementById('manufacturer').value,
    ingredients: ingredients,
    netWeight: parseFloat(document.getElementById('netWeight').value),
    storageMethod: document.getElementById('storageMethod').value,
    bestBefore: document.getElementById('bestBefore').value
  };

  // 必須フィールドのチェック
  if (!productData.productName || !productData.manufacturer || !productData.netWeight) {
    alert('製品名、製造者、内容量は必須項目です');
    return;
  }

  // 最大重量の原材料を特定
  const maxWeightIngredient = findMaxWeightIngredient();
  
  // 原産地が未設定の場合
  if (!maxWeightIngredient.origin) {
    pendingLabelGeneration = productData;
    showOriginDialog(maxWeightIngredient);
    return;
  }

  // 原産地が設定済みの場合は直接生成
  await generateLabelInternal(productData);
}

async function generateLabelInternal(productData) {
  try {
    const response = await fetch('/api/generate-label', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(productData)
    });

    const result = await response.json();
    if (result.status === 'success') {
      displayLabel(result.data);
    } else {
      alert('ラベルの生成に失敗しました: ' + result.message);
    }
  } catch (error) {
    console.error('Error generating label:', error);
    alert('ラベルの生成中にエラーが発生しました');
  }
}

function displayLabel(label) {
  const display = document.getElementById('label-display');
  let content = '';

  for (const [key, value] of Object.entries(label)) {
    if (value) {
      content += `【${key}】\n${value}\n\n`;
    }
  }

  display.textContent = content;
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  updateIngredientsList();
});