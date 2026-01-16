const form = document.getElementById('recipe-form');
const resultsContainer = document.getElementById('recipe-results');
const favoritesContainer = document.getElementById('favorites-list');
const loadingIndicator = document.getElementById('loading');

let favorites = JSON.parse(localStorage.getItem('recipeFavorites')) || [];

// Known Lists for Advanced Search Logic
const KNOWN_AREAS = ["American", "British", "Canadian", "Chinese", "Croatian", "Dutch", "Egyptian", "Filipino", "French", "Greek", "Indian", "Irish", "Italian", "Jamaican", "Japanese", "Kenyan", "Malaysian", "Mexican", "Moroccan", "Polish", "Portuguese", "Russian", "Spanish", "Thai", "Tunisian", "Turkish", "Vietnamese"];
const KNOWN_CATEGORIES = ["Beef", "Breakfast", "Chicken", "Dessert", "Goat", "Lamb", "Miscellaneous", "Pasta", "Pork", "Seafood", "Side", "Starter", "Vegan", "Vegetarian"];

// Event Listeners
form.addEventListener('submit', handleSearch);
document.addEventListener('DOMContentLoaded', loadFavorites);

async function handleSearch(e) {
    e.preventDefault();

    const searchInput = document.getElementById('search-input').value.trim();
    if (!searchInput) return;

    showLoading(true);
    resultsContainer.innerHTML = '';

    try {
        const terms = searchInput.split(/[ ,]+/).map(t => t.toLowerCase()); // Split by space or comma
        const capitalizedTerms = terms.map(t => t.charAt(0).toUpperCase() + t.slice(1));

        let foundArea = KNOWN_AREAS.find(a => capitalizedTerms.includes(a.toLowerCase()) || capitalizedTerms.includes(a));
        let foundCategory = KNOWN_CATEGORIES.find(c => capitalizedTerms.includes(c.toLowerCase()) || capitalizedTerms.includes(c));

        let meals = null;

        // Smart Search: Area + Category Intersection (e.g., "Indian Beef", "Italian Chicken")
        if (foundArea && foundCategory) {
            const areaPromise = fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?a=${foundArea}`).then(r => r.json());
            const catPromise = fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${foundCategory}`).then(r => r.json());

            const [areaData, catData] = await Promise.all([areaPromise, catPromise]);

            const areaMeals = areaData.meals || [];
            const catMeals = catData.meals || [];

            // Find intersection (meals in both lists)
            meals = areaMeals.filter(am => catMeals.some(cm => cm.idMeal === am.idMeal));

            // If found, fetch details for top results
            if (meals && meals.length > 0) {
                const topMeals = meals.slice(0, 24);
                const detailsPromises = topMeals.map(meal =>
                    fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`)
                        .then(res => res.json())
                        .then(d => d.meals ? d.meals[0] : null)
                );
                meals = await Promise.all(detailsPromises);
                meals = meals.filter(m => m !== null);
            }
        }

        // If Smart Search didn't run or found nothing, try standard name search
        if (!meals || meals.length === 0) {
            let response = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${searchInput}`);
            let data = await response.json();
            meals = data.meals;
        }

        // If Name Search failed, try Ingredient Search
        if (!meals) {
            let ingredient = searchInput;
            if (searchInput.includes(',')) {
                ingredient = searchInput.split(',')[0].trim();
            }

            let response = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${ingredient}`);
            let data = await response.json();
            meals = data.meals;

            if (meals) {
                const topMeals = meals.slice(0, 24);
                const detailsPromises = topMeals.map(meal =>
                    fetch(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`)
                        .then(res => res.json())
                        .then(d => d.meals ? d.meals[0] : null)
                );
                meals = await Promise.all(detailsPromises);
                meals = meals.filter(m => m !== null);
            }
        }

        displayRecipes(meals);

    } catch (error) {
        console.error('Error:', error);
        resultsContainer.innerHTML = `<div class="empty-state">Error fetching recipes. Please try again later.</div>`;
    } finally {
        showLoading(false);
    }
}

function displayRecipes(meals) {
    if (!meals || meals.length === 0) {
        resultsContainer.innerHTML = `<div class="empty-state">No recipes found. Try a different term.</div>`;
        return;
    }

    resultsContainer.innerHTML = meals.map(meal => createRecipeCard(meal)).join('');

    // Add event listeners to new favorite buttons
    document.querySelectorAll('.btn-fav').forEach(btn => {
        btn.addEventListener('click', toggleFavorite);
    });
}

function createRecipeCard(meal) {
    const isFav = favorites.some(fav => fav.id === meal.idMeal);

    // TheMealDB uses 'strArea' (e.g. Italian) and 'strCategory' (e.g. Seafood)
    const tag1 = meal.strArea ? `🌍 ${meal.strArea}` : '';
    const tag2 = meal.strCategory ? `🍴 ${meal.strCategory}` : '';

    const sourceUrl = meal.strSource || meal.strYoutube || '#';
    const hasLink = sourceUrl !== '#';

    // We store minimal data for favorites
    const dataAttribute = encodeURIComponent(JSON.stringify({
        id: meal.idMeal,
        title: meal.strMeal,
        image: meal.strMealThumb,
        area: meal.strArea,
        category: meal.strCategory,
        sourceUrl: sourceUrl
    }));

    return `
        <div class="recipe-card">
            <img src="${meal.strMealThumb}" alt="${meal.strMeal}" class="recipe-image">
            <div class="recipe-content">
                <h3 class="recipe-title">${truncate(meal.strMeal, 40)}</h3>
                <div class="recipe-info">
                    <span>${tag1}</span>
                    <span style="float: right;">${tag2}</span> 
                </div>
                <div class="recipe-actions">
                    ${hasLink ? `<a href="${sourceUrl}" target="_blank" class="btn-view">View Recipe</a>` : '<span class="text-muted">No Link</span>'}
                    <button class="btn-fav ${isFav ? 'active' : ''}" 
                        data-recipe="${dataAttribute}" 
                        title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
                        ♥
                    </button>
                </div>
            </div>
        </div>
    `;
}

function toggleFavorite(e) {
    const btn = e.target;
    const recipeData = JSON.parse(decodeURIComponent(btn.dataset.recipe));

    const index = favorites.findIndex(f => f.id === recipeData.id);

    if (index === -1) {
        // Add
        favorites.push(recipeData);
        btn.classList.add('active');
    } else {
        // Remove
        favorites.splice(index, 1);
        btn.classList.remove('active');

        // If the click happened inside the favorites list, re-render it
        if (btn.closest('.favorites-container')) {
            loadFavorites();
        }
    }

    localStorage.setItem('recipeFavorites', JSON.stringify(favorites));

    // Update all matching buttons on screen
    updateAllButtons(recipeData.id);
    if (!btn.closest('.favorites-container')) {
        loadFavorites(); // Refresh sidebar/bottom list
    }
}

function loadFavorites() {
    if (favorites.length === 0) {
        favoritesContainer.innerHTML = '<div class="empty-state">No favorites saved yet.</div>';
        return;
    }

    const mappedFavorites = favorites.map(fav => ({
        idMeal: fav.id,
        strMeal: fav.title,
        strMealThumb: fav.image,
        strArea: fav.area,
        strCategory: fav.category,
        strSource: fav.sourceUrl
    }));

    favoritesContainer.innerHTML = mappedFavorites.map(meal => createRecipeCard(meal)).join('');

    favoritesContainer.querySelectorAll('.btn-fav').forEach(btn => {
        btn.addEventListener('click', toggleFavorite);
    });
}

function updateAllButtons(id) {
    const isFav = favorites.some(f => f.id === id);
    document.querySelectorAll(`.btn-fav`).forEach(btn => {
        const data = JSON.parse(decodeURIComponent(btn.dataset.recipe));
        if (data.id === id) {
            if (isFav) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
}

function showLoading(show) {
    if (show) loadingIndicator.classList.remove('hidden');
    else loadingIndicator.classList.add('hidden');
}

function truncate(str, n) {
    return (str.length > n) ? str.substr(0, n - 1) + '&hellip;' : str;
}
