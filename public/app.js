let ingredients = [];
let pendingLabelGeneration = null;

function toggleDetailInput() {
    const checkbox = document.getElementById('simple-ingredient');
    const detailArea = document.getElementById('detail-input-area');
    const textarea = document.getElementById('compound-details');

    if (checkbox.checked) {
        detailArea.classList.add('disabled');
        textarea.value = '';  // 詳細情報をクリア
    } else {
        detailArea.classList.remove('disabled');
    }
}

function addIngredient() {
    const nameInput = document.querySelector('.ingredient-name');
    const weightInput = document.querySelector('.ingredient-weight');
    const detailsArea = document.getElementById('compound-details');
    const isSimple = document.getElementById('simple-ingredient').checked;

    const name = nameInput.value.trim();
    const weight = parseFloat(weightInput.value);

    // 基本バリデーション
    if (!name || !weight) {
        alert('原材料名と重量を入力してください');
        return;
    }

    // 詳細情報のバリデーション
    if (!isSimple && !detailsArea.value.trim()) {
        alert('原材料の詳細情報を入力するか、単一原材料の場合はチェックボックスにチェックを入れてください');
        return;
    }

    const ingredient = {
        name,
        weight,
        isSimple,
        detailIngredients: isSimple ? null : detailsArea.value.trim()
    };

    ingredients.push(ingredient);
    updateIngredientsList();
    clearInputs();
}

function clearInputs() {
    document.querySelector('.ingredient-name').value = '';
    document.querySelector('.ingredient-weight').value = '';
    document.getElementById('compound-details').value = '';
    document.getElementById('simple-ingredient').checked = false;
    toggleDetailInput();  // 詳細入力エリアを再表示
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
                <span>${ing.name} (${ing.weight}g)`;

        if (ing.isSimple) {
            content += '<span class="simple-mark">単一原材料</span>';
        }
        
        content += '</span>';

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

function findMaxWeightIngredient() {
    return ingredients.reduce((max, current) => 
        current.weight > (max?.weight || 0) ? current : max
    , null);
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
    toggleDetailInput();  // 初期状態の設定
});