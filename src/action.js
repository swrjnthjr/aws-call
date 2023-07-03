export const getKinesisKeys = async ()=>{
    const url = 'https://7a5tspbrqi.execute-api.ap-southeast-1.amazonaws.com/default/AV-getSMKeys';
    try{
        let secret = await fetch(url,{method:'GET'});
        secret= await secret.json();
        return secret
    }catch(err){
        // state.setKeys({'secretKey':null,'secretValye':null});
        console.log("Error while getting secret",err);
        return null
    }
};