// API va WebSocket URL’lari
const API_URL = "https://uzex-backend.onrender.com";
const WS_URL = "wss://uzex-backend.onrender.com";

// Global o‘zgaruvchilar
let selectedPlateId = null;
let isStaff = false;
let countdownTimer = null;
let platesSocket = null;
let bidSocket = null;

// DOM yuklanishini kutish
document.addEventListener("DOMContentLoaded", () => {
  // Elementlarni yuklash
  const elements = {
    loginSection: checkElement("login-section"),
    header: checkElement("header"),
    registerSection: checkElement("register-section"),
    authSection: checkElement("auth-section"),
    platesSection: checkElement("plates-section"),
    plateDetail: checkElement("plate-detail"),
    loginForm: checkElement("login-form"),
    registerForm: checkElement("register-form"),
    logoutButton: checkElement("logout-button"),
    platesList: checkElement("plates-list"),
    bidForm: checkElement("bid-form"),
    loginError: checkElement("login-error"),
    registerError: checkElement("register-error"),
    bidMessage: checkElement("bid-message"),
    searchInput: checkElement("search-input"),
    searchButton: checkElement("search-button"),
    showLogin: checkElement("show-login"),
    showRegister: checkElement("show-register"),
    staffSection: checkElement("staff-section"),
    createPlateForm: checkElement("create-plate-form"),
    createPlateError: checkElement("create-plate-error"),
    staffActions: checkElement("staff-actions"),
    updatePlateForm: checkElement("update-plate-form"),
    deletePlateButton: checkElement("delete-plate-button"),
    staffActionError: checkElement("staff-action-error"),
    backToList: checkElement("back-to-list"),
    currentUsername: checkElement("current-username"),
    plateTitle: checkElement("plate-title"),
    plateDescription: checkElement("plate-description"),
    plateDeadline: checkElement("plate-deadline"),
    bidsList: checkElement("bids-list"),
    loginLoading: checkElement("login-loading"),
    registerLoading: checkElement("register-loading"),
    platesLoading: checkElement("plates-loading"),
    detailLoading: checkElement("detail-loading"),
    bidLoading: checkElement("bid-loading"),
    createLoading: checkElement("create-loading"),
    updateLoading: checkElement("update-loading"),
    days: checkElement("days"),
    hours: checkElement("hours"),
    minutes: checkElement("minutes"),
    seconds: checkElement("seconds"),
  };

  // Elementni tekshirish funksiyasi
  function checkElement(id) {
    const element = document.getElementById(id);
    if (!element) console.error(`${id} elementi topilmadi!`);
    return element || null;
  }

  // Loadingni boshqarish
  function showLoading(element) {
    if (element) element.classList.remove("hidden");
  }

  function hideLoading(element) {
    if (element) element.classList.add("hidden");
  }

  // Token boshqaruvi
  const tokenManager = {
    get: () => localStorage.getItem("token"),
    set: (token) => localStorage.setItem("token", token),
    clear: () => localStorage.removeItem("token"),
  };

  // API so‘rovlari
  async function apiRequest(endpoint, method = "GET", data = null) {
    const token = tokenManager.get();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers,
        body: data ? JSON.stringify(data) : null,
      });

      if (response.status === 401) {
        tokenManager.clear();
        location.reload();
        return null;
      }

      const text = await response.text();
      const result = text ? JSON.parse(text) : null;

      if (!response.ok) {
        throw new Error(result?.detail || `So‘rovda xato: ${response.status}`);
      }
      return result;
    } catch (error) {
      console.error(`API xatosi (${endpoint}):`, error);
      throw error;
    }
  }

  // Foydalanuvchi ma’lumotlari
  async function getUserInfo() {
    try {
      const user = await apiRequest("/users/me");
      isStaff = user.is_staff || false;
      if (elements.currentUsername) {
        elements.currentUsername.textContent = user.username || "";
      }
      return user;
    } catch (error) {
      isStaff = false;
      if (elements.currentUsername) elements.currentUsername.textContent = "";
      console.error("Foydalanuvchi ma’lumotlarini olishda xato:", error);
      return null;
    }
  }

  // WebSocket boshqaruvi
  const webSocketManager = {
    connectPlates: () => {
      const token = tokenManager.get();
      if (!token || platesSocket?.readyState === WebSocket.OPEN) return;

      platesSocket = new WebSocket(`${WS_URL}/ws/plates/?token=${token}`);

      platesSocket.onopen = () => console.log("Plates WebSocket ulandi");
      platesSocket.onclose = () => {
        console.log("Plates WebSocket uzildi, qayta ulanmoqda...");
        setTimeout(webSocketManager.connectPlates, 2000);
      };
      platesSocket.onerror = (error) => console.error("Plates WebSocket xatosi:", error);
      platesSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Plates WebSocket xabari:", data); // Debugging
        if (data.type === "initial_plates") {
          updatePlatesList(data.plates);
        } else if (data.type === "plate_created") {
          addPlateToList(data.plate);
        } else if (data.type === "plate_updated") {
          updatePlateInList(data.plate);
        } else if (data.type === "plate_deleted") {
          removePlateFromList(data.plate_id);
        }
      };
    },

    connectBids: (plateId) => {
      const token = tokenManager.get();
      if (!token || bidSocket?.readyState === WebSocket.OPEN) return;

      bidSocket = new WebSocket(`${WS_URL}/ws/bids/${plateId}/?token=${token}`);

      bidSocket.onopen = () => console.log(`Bid WebSocket ulandi: plate_id=${plateId}`);
      bidSocket.onclose = () => {
        console.log("Bid WebSocket uzildi, qayta ulanmoqda...");
        setTimeout(() => webSocketManager.connectBids(plateId), 2000);
      };
      bidSocket.onerror = (error) => console.error("Bid WebSocket xatosi:", error);
      bidSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("Bids WebSocket xabari:", data); // Debugging
        if (data.type === "initial") {
          updateBidsList(data.bids, data.highest_bid);
        } else if (data.type === "new_bid") {
          addBidToList(data.bid, data.highest_bid);
        } else if (data.type === "bid_deleted") {
          removeBidFromList(data.bid_id, data.new_highest_bid);
        }
      };
    },

    disconnect: () => {
      if (platesSocket && platesSocket.readyState === WebSocket.OPEN) {
        platesSocket.close();
        platesSocket = null;
      }
      if (bidSocket && bidSocket.readyState === WebSocket.OPEN) {
        bidSocket.close();
        bidSocket = null;
      }
    },
  };

  // Plitalarni yangilash funksiyalari
  function updatePlatesList(plates) {
    if (elements.platesList) {
      elements.platesList.innerHTML = "";
      if (!plates.length) {
        elements.platesList.innerHTML = "<p>Hech qanday avtoraqam topilmadi.</p>";
      } else {
        plates.forEach((plate) => {
          const div = document.createElement("div");
          div.className = "plate-card";
          div.dataset.id = plate.id;
          div.innerHTML = `
            <div class="plate-image">${formatPlateNumber(plate.plate_number)}</div>
            <p>№ ${plate.id}</p>
            <p>Muddati: ${new Date(plate.deadline).toLocaleString()}</p>
            <p>Joriy narx: ${new Intl.NumberFormat("uz-UZ").format(plate.highest_bid || 0)} so'm</p>
            <button class="detail-btn">Batafsil</button>
          `;
          div.querySelector(".detail-btn").addEventListener("click", () => showPlateDetail(plate.id));
          elements.platesList.appendChild(div);
        });
      }
    }
  }

  function addPlateToList(plate) {
    if (elements.platesList) {
      const div = document.createElement("div");
      div.className = "plate-card";
      div.dataset.id = plate.id;
      div.innerHTML = `
        <div class="plate-image">${formatPlateNumber(plate.plate_number)}</div>
        <p>№ ${plate.id}</p>
        <p>Muddati: ${new Date(plate.deadline).toLocaleString()}</p>
        <p>Joriy narx: ${new Intl.NumberFormat("uz-UZ").format(plate.highest_bid || 0)} so'm</p>
        <button class="detail-btn">Batafsil</button>
      `;
      div.querySelector(".detail-btn").addEventListener("click", () => showPlateDetail(plate.id));
      elements.platesList.insertBefore(div, elements.platesList.firstChild);
    }
  }

  function updatePlateInList(plate) {
    if (elements.platesList) {
      const plateElement = elements.platesList.querySelector(`[data-id="${plate.id}"]`);
      if (plateElement) {
        plateElement.innerHTML = `
          <div class="plate-image">${formatPlateNumber(plate.plate_number)}</div>
          <p>№ ${plate.id}</p>
          <p>Muddati: ${new Date(plate.deadline).toLocaleString()}</p>
          <p>Joriy narx: ${new Intl.NumberFormat("uz-UZ").format(plate.highest_bid || 0)} so'm</p>
          <button class="detail-btn">Batafsil</button>
        `;
        plateElement.querySelector(".detail-btn").addEventListener("click", () => showPlateDetail(plate.id));
      } else {
        addPlateToList(plate);
      }
    }
  }

  function removePlateFromList(plateId) {
    if (elements.platesList) {
      const plateElement = elements.platesList.querySelector(`[data-id="${plateId}"]`);
      if (plateElement) plateElement.remove();
    }
  }

  // Bid’larni yangilash funksiyalari
  function updateBidsList(bids, highestBid) {
    if (elements.bidsList) {
      elements.bidsList.innerHTML = "";
      bids.forEach((bid) => {
        const li = document.createElement("li");
        li.dataset.id = bid.id;
        li.textContent = `${new Intl.NumberFormat("uz-UZ").format(bid.amount)} so'm - Foydalanuvchi: ${bid.user_id} - ${new Date(bid.created_at).toLocaleString()}`;
        elements.bidsList.appendChild(li);
      });
    }
  }

  function addBidToList(bid, highestBid) {
    if (elements.bidsList) {
      const li = document.createElement("li");
      li.dataset.id = bid.id;
      li.textContent = `${new Intl.NumberFormat("uz-UZ").format(bid.amount)} so'm - Foydalanuvchi: ${bid.user_id} - ${new Date(bid.created_at).toLocaleString()}`;
      elements.bidsList.insertBefore(li, elements.bidsList.firstChild);
    }
    // Agar umumiy plitalar sahifasida bo‘lsak, highest_bid ni yangilash kerak emas, chunki /ws/plates/ buni qiladi
  }

  function removeBidFromList(bidId, newHighestBid) {
    if (elements.bidsList) {
      const bidElement = elements.bidsList.querySelector(`[data-id="${bidId}"]`);
      if (bidElement) bidElement.remove();
    }
  }

  // Login jarayoni
  elements.loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;

    showLoading(elements.loginLoading);
    try {
      const formData = new URLSearchParams({ username, password, grant_type: "password" });
      const response = await fetch(`${API_URL}/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });

      if (!response.ok) throw new Error("Login xatosi");
      const data = await response.json();
      tokenManager.set(data.access_token);
      if (elements.loginError) elements.loginError.textContent = "";
      await getUserInfo();

      elements.authSection.classList.add("hidden");
      elements.platesSection.classList.remove("hidden");
      elements.logoutButton.classList.remove("hidden");
      elements.header.classList.remove("hidden");
      if (isStaff && elements.staffSection) elements.staffSection.classList.remove("hidden");

      loadPlates();
      webSocketManager.connectPlates();
    } catch (err) {
      if (elements.loginError) elements.loginError.textContent = err.message || "Foydalanuvchi nomi yoki parol xato";
    } finally {
      hideLoading(elements.loginLoading);
    }
  });

  // Logout jarayoni
  elements.logoutButton?.addEventListener("click", () => {
    if (confirm("Tizimdan chiqishni xohlaysizmi?")) {
      webSocketManager.disconnect();
      elements.header.classList.add("hidden");
      tokenManager.clear();
      if (elements.currentUsername) elements.currentUsername.textContent = "";
      location.reload();
    }
  });

  // Avtoraqam formatlash
  function formatPlateNumber(plateNumber) {
    return plateNumber && plateNumber.length >= 3
      ? `${plateNumber.slice(0, 2)}|${plateNumber.slice(2)}`
      : plateNumber || "Noma'lum";
  }

  // Plitalarni yuklash
  async function loadPlates(query = "") {
    showLoading(elements.platesLoading);
    try {
      const url = query ? `/plates/search/?plate_number__contains=${encodeURIComponent(query)}` : "/plates/search/";
      const plates = await apiRequest(url);
      updatePlatesList(plates);
    } catch (err) {
      console.error("Plitalarni yuklashda xato:", err);
      if (elements.platesList) elements.platesList.innerHTML = "<p>Ma'lumotlarni yuklashda xato yuz berdi.</p>";
    } finally {
      hideLoading(elements.platesLoading);
    }
  }

  // Qidiruv
  elements.searchButton?.addEventListener("click", () => {
    const query = elements.searchInput?.value.trim() || "";
    loadPlates(query);
  });

  elements.searchInput?.addEventListener("input", debounce(() => {
    loadPlates(elements.searchInput.value.trim());
  }, 500));

  // Plita detallari
  async function showPlateDetail(id) {
    selectedPlateId = id;
    showLoading(elements.detailLoading);
    try {
      if (countdownTimer) clearInterval(countdownTimer);

      const plate = await apiRequest(`/plates/${id}/`);
      if (elements.plateTitle) elements.plateTitle.textContent = formatPlateNumber(plate.plate_number);
      if (elements.plateDescription) elements.plateDescription.textContent = plate.description || "Ta'rif mavjud emas";
      if (elements.plateDeadline) elements.plateDeadline.textContent = `Muddati: ${new Date(plate.deadline).toLocaleString()}`;
      startCountdown(plate.deadline);

      if (elements.bidsList) {
        elements.bidsList.innerHTML = "";
        plate.bids?.forEach((bid) => {
          const li = document.createElement("li");
          li.dataset.id = bid.id;
          li.textContent = `${new Intl.NumberFormat("uz-UZ").format(bid.amount)} so'm - Foydalanuvchi: ${bid.user_id} - ${new Date(bid.created_at).toLocaleString()}`;
          elements.bidsList.appendChild(li);
        });
      }

      elements.platesSection.classList.add("hidden");
      elements.plateDetail.classList.remove("hidden");
      if (isStaff && elements.staffActions) {
        elements.staffActions.classList.remove("hidden");
        elements.updatePlateForm["update-plate-number"].value = plate.plate_number;
        elements.updatePlateForm["update-plate-description"].value = plate.description || "";
        elements.updatePlateForm["update-plate-deadline"].value = new Date(plate.deadline).toISOString().slice(0, 16);
      } else if (elements.staffActions) {
        elements.staffActions.classList.add("hidden");
      }
      if (elements.bidMessage) elements.bidMessage.textContent = "";

      webSocketManager.disconnect();
      webSocketManager.connectBids(id);
    } catch (err) {
      console.error("Plita detallarini yuklashda xato:", err);
    } finally {
      hideLoading(elements.detailLoading);
    }
  }

  // Countdown
  function startCountdown(deadline) {
    const deadlineDate = new Date(deadline);

    function updateCountdown() {
      const timeLeft = deadlineDate - Date.now();
      if (timeLeft <= 0) {
        if (elements.plateDeadline) elements.plateDeadline.innerHTML = "<h2>Muddati tugadi</h2>";
        clearInterval(countdownTimer);
        return;
      }

      const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

      if (elements.days) elements.days.textContent = String(days).padStart(2, "0");
      if (elements.hours) elements.hours.textContent = String(hours).padStart(2, "0");
      if (elements.minutes) elements.minutes.textContent = String(minutes).padStart(2, "0");
      if (elements.seconds) elements.seconds.textContent = String(seconds).padStart(2, "0");
    }

    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  // Bid qo‘yish
  elements.bidForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!tokenManager.get()) {
      if (elements.bidMessage) elements.bidMessage.textContent = "Iltimos, avval tizimga kiring!";
      return;
    }

    const amount = parseFloat(e.target["bid-amount"].value);
    if (!amount || amount <= 0) {
      if (elements.bidMessage) elements.bidMessage.textContent = "Iltimos, haqiqiy miqdor kiriting!";
      return;
    }

    showLoading(elements.bidLoading);
    try {
      await apiRequest("/bids/", "POST", { amount, plate_id: selectedPlateId });
      if (elements.bidMessage) {
        elements.bidMessage.textContent = "Taklif muvaffaqiyatli qo‘yildi!";
        elements.bidMessage.className = "message success";
      }
      e.target["bid-amount"].value = "";
    } catch (err) {
      if (elements.bidMessage) {
        elements.bidMessage.textContent = err.message || "Taklif qo‘yishda xato";
        elements.bidMessage.className = "message error";
      }
    } finally {
      hideLoading(elements.bidLoading);
    }
  });

  // Plita yaratish
  elements.createPlateForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isStaff) {
      if (elements.createPlateError) elements.createPlateError.textContent = "Sizda bu amalni bajarish huquqi yo‘q!";
      return;
    }

    showLoading(elements.createLoading);
    try {
      await apiRequest("/plates/", "POST", {
        plate_number: e.target["plate-number"].value,
        description: e.target["plate-description"].value,
        deadline: e.target["plate-deadline"].value,
      });
      if (elements.createPlateError) elements.createPlateError.textContent = "Avtoraqam muvaffaqiyatli qo‘shildi!";
      e.target.reset();
    } catch (err) {
      if (elements.createPlateError) elements.createPlateError.textContent = err.message || "Avtoraqam qo‘shishda xato";
    } finally {
      hideLoading(elements.createLoading);
    }
  });

  // Plita yangilash
  elements.updatePlateForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isStaff) {
      if (elements.staffActionError) elements.staffActionError.textContent = "Sizda bu amalni bajarish huquqi yo‘q!";
      return;
    }

    showLoading(elements.updateLoading);
    try {
      await apiRequest(`/plates/${selectedPlateId}/`, "PUT", {
        plate_number: e.target["update-plate-number"].value,
        description: e.target["update-plate-description"].value,
        deadline: e.target["update-plate-deadline"].value,
      });
      showPlateDetail(selectedPlateId);
    } catch (err) {
      if (elements.staffActionError) elements.staffActionError.textContent = err.message || "Avtoraqam yangilashda xato";
    } finally {
      hideLoading(elements.updateLoading);
    }
  });

  // Plita o‘chirish
  elements.deletePlateButton?.addEventListener("click", async () => {
    if (!isStaff || !confirm("Avtoraqamni o‘chirishni xohlaysizmi?")) return;

    showLoading(elements.updateLoading);
    try {
      await apiRequest(`/plates/${selectedPlateId}/`, "DELETE");
      elements.plateDetail.classList.add("hidden");
      elements.platesSection.classList.remove("hidden");
      loadPlates();
    } catch (err) {
      if (elements.staffActionError) elements.staffActionError.textContent = err.message || "Avtoraqam o‘chirishda xato";
    } finally {
      hideLoading(elements.updateLoading);
    }
  });

  // Orqaga qaytish
  elements.backToList?.addEventListener("click", () => {
    webSocketManager.disconnect();
    elements.plateDetail.classList.add("hidden");
    elements.platesSection.classList.remove("hidden");
    loadPlates();
    webSocketManager.connectPlates();
  });

  // Ro‘yxatdan o‘tish
  elements.showRegister?.addEventListener("click", () => {
    elements.loginSection.classList.add("hidden");
    elements.registerSection.classList.remove("hidden");
  });

  elements.registerForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const email = e.target.email.value;
    const password = e.target.password.value;

    showLoading(elements.registerLoading);
    try {
      await apiRequest("/users/", "POST", { username, email, password });
      if (elements.registerError) {
        elements.registerError.textContent = "Ro‘yxatdan o‘tish muvaffaqiyatli!";
        elements.registerError.className = "error-message success";
      }
      setTimeout(() => {
        elements.registerSection.classList.add("hidden");
        elements.loginSection.classList.remove("hidden");
      }, 2000);
    } catch (err) {
      if (elements.registerError) {
        elements.registerError.textContent = err.message || "Ro‘yxatdan o‘tishda xatolik!";
        elements.registerError.className = "error-message error";
      }
    } finally {
      hideLoading(elements.registerLoading);
    }
  });

  elements.showLogin?.addEventListener("click", () => {
    elements.registerSection.classList.add("hidden");
    elements.loginSection.classList.remove("hidden");
  });

  // Debounce funksiyasi
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Ilova boshlanishi
  (async function initApp() {
    elements.header.classList.add("hidden");
    if (tokenManager.get()) {
      showLoading(elements.platesLoading);
      try {
        await getUserInfo();
        elements.authSection.classList.add("hidden");
        elements.platesSection.classList.remove("hidden");
        elements.logoutButton.classList.remove("hidden");
        elements.header.classList.remove("hidden");
        if (isStaff && elements.staffSection) elements.staffSection.classList.remove("hidden");
        await loadPlates();
        webSocketManager.connectPlates();
      } finally {
        hideLoading(elements.platesLoading);
      }
    } else {
      elements.authSection.classList.remove("hidden");
    }
  })();
});