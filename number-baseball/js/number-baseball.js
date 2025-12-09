const input = document.querySelector('#input');
const form = document.querySelector('#form');
const log = document.querySelector('#logs');
const instruction = document.querySelector('.instruction');

const answer = new Set();

let answerArr = [];
let tries = [];
let setupSize = 4;
let setupTry = 10;
let gameActive = false;

startGame();

function checkInput(input){
    if (input.length !== setupSize){
        return alert(`${setupSize}자리 숫자를 입력하세요`);
    }
    if (new Set(input).size !== setupSize){
        return alert('중복된 숫자를 입력했습니다.');
    }
    if (tries.includes(input)){
        return alert('이미 시도한 숫자입니다.');
    }
    return true;
}

function initSetup(){
    while (true)
    {
        setupSize = parseInt(prompt('몇 자리 숫자를 맞추시겠습니까?'), 10);
        setupTry = parseInt(prompt('몇 번 시도하시겠습니까?'), 10);
        if (isNaN(setupSize) || isNaN(setupTry) || setupSize < 1 || setupSize > 9 || setupTry < 1) {
            alert('올바른 숫자를 입력해주세요.');
        }
        else{
            break;
        }
    }
    input.setAttribute('maxlength', setupSize);
    input.setAttribute('placeholder', `${setupSize}자리 숫자 입력`);
    instruction.textContent = `${setupSize}자리 숫자를 맞추세요! 기회는 ${setupTry}번 입니다.`;
}
function startGame(){
    initSetup();
    const answer = new Set();
    while (answer.size < setupSize) {
        const randomNum = Math.floor(Math.random() * 9)+1;
        answer.add(randomNum);
    }
    answerArr = Array.from(answer);
    console.log(answerArr);
    tries = [];
    log.textContent = '';
    input.disabled = false;
    gameActive = true;
    instruction.textContent = `${setupSize}자리 숫자를 맞추세요! 기회는 ${setupTry}번 입니다.`;
}
form.addEventListener('submit', (e)=>{
    e.preventDefault();

    if (!gameActive){
        startGame();
        return;
    }
    const value = input.value;
    input.value = '';

    const valid = checkInput(value);
    if (!valid) return;

    if(answerArr.join('') === value){
        log.innerHTML += '<br>홈런! 확인 버튼을 눌러 다시 시작하세요.';
        input.disabled = true;
        gameActive = false;
        return;
    }
    let strike = 0;
    let ball = 0;
    
    for (let i=0; i< answerArr.length; i++){
        const index = value.indexOf(answerArr[i]);

        if (index > -1){
            if (index === i){
                strike +=1;
            }
            else{
                ball +=1;
            }
        }
    }
    log.append(`${value} : ${strike} 스트라이크, ${ball} 볼, ${setupSize-(ball+strike)} 아웃`, document.createElement('br'));
    tries.push(value);
    // 패배 체크 위치가 조정될 필요가 있다. 마지막에 값을 입력받아야 패배 출력이 되는건 순서가 이상하다.
    if ( tries.length >=setupTry){
        const message = document.createTextNode(`패배! 정답은 ${answerArr.join("")}였습니다. 확인 버튼을 눌러 다시 시작하세요.`);
        log.appendChild(document.createElement('br'));
        log.appendChild(message);
        input.disabled = true;
        gameActive = false;
        return;
    }
    instruction.textContent = `${setupSize}자리 숫자를 맞추세요! 기회는 ${setupTry - tries.length}번 입니다.`;
});