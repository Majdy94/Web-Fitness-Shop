"use strict";
// activating the Hamburger Menu
const $toggleButton = document.querySelector(".toggle-spans");
const $navbarButtons = document.querySelector(".navbar-buttons");
// login and registration functions
const $loginContainer = document.querySelector(".container");
const $pwShowHide = document.querySelectorAll(".showHidePw");
const $passwords = document.querySelectorAll(".password");
const $signUP = document.querySelector(".signup-link");
const $login = document.querySelector(".login-link");
const $formLogin = document.querySelector(".form-login");
const $passwordTest = document.querySelector(".text-password");
// the buttons of the cart and it's items
const $cardBtn = document.querySelector(".cart-btn");
const $closeCardBtn = document.querySelector(".close-cart");
const $clearCardBtn = document.querySelector(".clear-cart");
const $cartDOM = document.querySelector(".cart");
const $cartOverlay = document.querySelector(".cart-overlay");
const $cartItems = document.querySelector(".cart-items");
const $cartTotal = document.querySelector(".cart-total");
const $cartContent = document.querySelector(".cart-content");
const $productsDom = document.querySelector(".products-center");
// exchange variabels
const select = document.querySelector(".exchange-box");

const $inputPrice = document.getElementsByClassName("priceIdInput");

// open the Hamburger Menu
$toggleButton.addEventListener("click", () => {
  $navbarButtons.classList.toggle("active");
});
// fetching the API for the youTube videos
fetch(
  "https://youtube.googleapis.com/youtube/v3/search?part=snippet&channelId=UCFqc_TuWJoXpmpDyHLjSVTA&maxResults=10&order=date&key=AIzaSyDAc7R3wjhPhG4VbpAANimhiR-PS4VJxOo"
)
  .then((results) => {
    return results.json();
  })
  .then((data) => {
    let videos = data.items;
    let youtubeContainer = document.querySelector(".youtubeContainer");
    for (const video of videos) {
      youtubeContainer.innerHTML += `
          <div class="card">
            <a href="https://www.youtube.com/watch?v=${video.id.videoId}">
              <img src="${video.snippet.thumbnails.high.url}">
            </a>
            <a class="videoTitleYoutube" href="https://www.youtube.com/watch?v=${video.id.videoId}" target="_blank">
             ${video.snippet.title}
            </a>
          </div>
      `;
    }
    console.log(videos);
  });

// function the Login and registeration site the password icons
$pwShowHide.forEach((icon) => {
  icon.addEventListener("click", () => {
    $passwords.forEach((password) => {
      if (password.type === "password") {
        password.type = "text";
        $pwShowHide.forEach((iconEye) => {
          iconEye.classList.replace("uil-eye-slash", "uil-eye");
          console.log("geht net");
        });
      } else {
        password.type = "password";
        $pwShowHide.forEach((iconEye) => {
          iconEye.classList.replace("uil-eye", "uil-eye-slash");
        });
      }
    });
  });
});

//  the carts
let cart = [];

// buttons
let buttonsDOM = [];

// getting the products
class Products {
  async getProducts() {
    try {
      let result = await fetch("products.json");
      let data = await result.json();
      let products = data.items;
      products = products.map((item) => {
        const { desc } = item.fields;
        const { title, price } = item.fields;
        const { id } = item.sys;
        const image = item.fields.image.fields.file.url;
        return { desc, title, price, id, image };
      });
      return products;
    } catch (error) {
      console.log(error);
    }
  }
}
// display products
class UI {
  displayProducts(products) {
    let result = "";
    products.forEach((product) => {
      result += `
      <!-- single product -->
      <article class="product">
      <div class="img-container">
      <h3 class="product-desc">${product.desc}</h3>
      <img src=${product.image} alt="product" class="product-img">
      <button class="bag-btn" data-id=${product.id}>
      <i class="fas fa-shopping-cart">Add to Cart</i>
      </button>
      </div>
      <h3>${product.title}</h3>
      <h4>${product.price}$</h4>
      </article>
      <!-- end of single product -->
      `;
    });
    $productsDom.innerHTML = result;
  }
  //using the forEach method to select the cart buttons to add the products to the cart
  getBagButtons() {
    const buttons = [...document.querySelectorAll(".bag-btn")];
    buttonsDOM = buttons;
    buttons.forEach((button) => {
      let id = button.dataset.id;
      let inCart = cart.find((item) => item.id === id);
      if (inCart) {
        button.innerText = "In Cart";
        button.disabled = true;
      }
      button.addEventListener("click", (event) => {
        // getting the details div of the paied elements and give them the id to show the videos after payment is successed
        const details = document.querySelector(".details");
        details.innerHTML += `<input type="hidden" name="item${id}" value="${id}" id="i${id}">`;
        event.target.innerText = "In Cart";
        event.target.disabled = true;
        // give me all items in this Object and add to them the amount 1
        let cartItem = { ...Storage.getProducts(id), amount: 1 };
        // add programm to the cart
        cart.push(cartItem);
        // save the program in LS
        Storage.saveCart(cart);
        // set cart values
        this.setCartValues(cart);
        // display cart item
        this.addCartItem(cartItem);
        // show the cart
        this.showCart();
        // exchange function
        this.exchangeValue(e);
      });
    });
  }
  // here we updating the price of each product and the total price of them by clicking on them
  setCartValues(cart) {
    const priceId = document.querySelector(".price");
    let tempTotal = 0;
    let itemstotal = 0;
    cart.map((item) => {
      tempTotal += item.price * item.amount;
      itemstotal += item.amount;
    });
    $cartTotal.innerText = parseFloat(tempTotal.toFixed(2)); // float بترجعلي عدد مع الفواصل مشان يظهر ناتج مع قيمتين جنبه
    $cartItems.innerText = itemstotal;
    priceId.innerHTML = `<input class ="priceIdInput" type="hidden" name="price" value="${tempTotal.toFixed(
      2
    )}">`;

    // calculating the exchanges EUR/USD
    // declaring the function of the exchange process
    const exchangeValue = (e) => {
      const inputHidden = document.querySelector("#priceTotal");
      let exchangePrice = parseFloat($cartTotal.textContent);
      const XHL = new XMLHttpRequest();
      XHL.open("GET", "https://api.exchangerate-api.com/v4/latest/EUR");
      XHL.send();
      XHL.onload = function () {
        const results = JSON.parse(XHL.response);
        const yourTotal = document.querySelector(".yourTotal");
        console.log(yourTotal);
        if (select.value === "EUR") {
          //hide the dollar sign
          yourTotal.style.display = "none";
          let resultUSD = exchangePrice / results.rates.USD;
          $cartTotal.innerHTML = resultUSD.toFixed(2) + "EUR";
          inputHidden.value = resultUSD.toFixed(2);
        } else if (select.value === "USD") {
          yourTotal.style.display = "none";
          let resultUSD = exchangePrice * results.rates.USD;
          $cartTotal.innerHTML = `${resultUSD.toFixed(2)}` + "USD";
          inputHidden.value = resultUSD.toFixed(2);
        }
      };
    };
    select.addEventListener("change", exchangeValue);
  }
  // here we creating and adding the items
  //  in the overlay window by clicking on them
  addCartItem(item) {
    const div = document.createElement("div");
    div.classList.add("cart-item");
    div.innerHTML = `
        <img src=${item.image} alt="product">
                    <div>
                        <h4>${item.title}</h4>
                        <h5>${item.price}</h5>
                        <span class="remove-item" data-id=${item.id}>remove</span>
                    </div>
                    <div>
                        <p class="item-amount">${item.amount}</p>
                    </div>
        `;
    $cartContent.appendChild(div);
  }
  showCart() {
    $cartOverlay.classList.add("transparentBcg");
    $cartDOM.classList.add("showCart");
  }
  setUpAPP() {
    // updating the item from the localstorage and called the setCartValues method
    cart = Storage.getCart();
    this.setCartValues(cart);
    this.populateCart(cart);
    $cardBtn.addEventListener("click", this.showCart);
    $closeCardBtn.addEventListener("click", this.hideCart);
  }
  populateCart(cart) {
    cart.forEach((item) => this.addCartItem(item));
  }
  //function to hide the Overlay Cart by removing the Class name
  // this will be used when clicking on clear cart 
  hideCart() {
    $cartOverlay.classList.remove("transparentBcg");
    $cartDOM.classList.remove("showCart");
  }
  cartLogic() {
    // / clear cart button
    $clearCardBtn.addEventListener("click", () => {
      this.clearCart();
    });
    // cart functionality
    $cartContent.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-item")) {
        let removeItem = e.target;
        let id = removeItem.dataset.id;
        // deleting the item by it's id
        // document.querySelector(`#i${id}`).remove();
        // removing the parent parent element where the child item exist
        $cartContent.removeChild(removeItem.parentElement.parentElement);
        // im using the removeItem function again to remove the items
        this.removeItem(id);
        // saving the items in the LS when reloading the page
        Storage.saveCart(cart);
        // this.setCartValues(cart);
          //  lowerAmount.previousElementSibling.innerText = tempItem.amount;
       } //else if (e.target.classList.contains("fa-chevron-up")) {
      //   let addAmount = e.target;
      //   let id = addAmount.dataset.id;
      //   let tempItem = cart.find((item) => item.id === id);
      //   tempItem.amount = tempItem.amount + 1;
        // calling the saveCart method to save the changes in the LocalStorage
        // Storage.saveCart(cart);
        // updating the cart value
        // this.setCartValues(cart);
        // increasing the counter of the items  and the total amount when clicking
        // addAmount.nextElementSibling.innerText = tempItem.amount;
      // } else if (e.target.classList.contains("fa-chevron-down")) {
      //   let lowerAmount = e.target;
      //   let id = lowerAmount.dataset.id;
      //   let tempItem = cart.find((item) => item.id === id);
      //   tempItem.amount = tempItem.amount - 1;
        // saving the items as long as we increasing their numbers,
        // otherwise removing the hole item-cart from the cart
        // if (tempItem.amount > 0) {
        //   Storage.saveCart(cart);
        //   this.setCartValues(cart);
        //   lowerAmount.previousElementSibling.innerText = tempItem.amount;
        //  }
          else {
          $cartContent.removeChild(lowerAmount.parentElement.parentElement);
           this.removeItem(id);
         }
      
    });
  }
  clearCart() {
    //  when clearing the cart i wanna loop all the items
    // that i have and use this method ((removeItem))
    let cartItems = cart.map((item) => item.id);
    cartItems.forEach((id) => this.removeItem(id));
    // remove the items with children method in the cart
    // when clicking on the clear button
    while ($cartContent.children.length > 0) {
      $cartContent.removeChild($cartContent.children[0]);
    }
    this.hideCart();
  }
  removeItem(id) {
    // filtering each item's id and remove each id that
    // dosent exist
    cart = cart.filter((item) => item.id !== id);
    // running the setCartValues with the last
    // value of the cart (that should be 0)
    this.setCartValues(cart);
    // running the saveCart method with the last value (card)
    Storage.saveCart(cart);
    // accessing the buttons to return the icons and
    // the changing the innerHTML of the them
    let button = this.getSingleButton(id);
    button.disabled = false;
    button.innerHTML = `<i class = "fas
             fa-shopping-cart"></i> add to cart`;
  }

  getSingleButton(id) {
    // using the find the return me the button that has the
    // attribute  dataset.id equal ot the button we passing it
    return buttonsDOM.find((button) => button.dataset.id === id);
  }
}

// local Storage
class Storage {
  static saveProducts(products) {
    localStorage.setItem("products", JSON.stringify(products));
  }
  static getProducts(id) {
    let products = JSON.parse(localStorage.getItem("products"));
    return products.find((product) => product.id === id);
  }
  static saveCart(cart) {
    localStorage.setItem("cart", JSON.stringify(cart));
  }
  static getCart() {
    return localStorage.getItem("cart")
      ? JSON.parse(localStorage.getItem("cart"))
      : [];
  }
}
// when loading the page keep all changes in the local storage
document.addEventListener("DOMContentLoaded", () => {
  const ui = new UI();
  const products = new Products();
  // setUp Applications
  ui.setUpAPP();
  // get all products
  products
    .getProducts()
    .then((products) => {
      ui.displayProducts(products);
      Storage.saveProducts(products);
    })
    .then(() => {
      ui.getBagButtons();
      ui.cartLogic();
    });
});
