FROM electronuserland/builder:latest

# Install required packages
RUN apt-get update && apt-get install -y \
    dpkg \
    fakeroot \
    libasound2-dev \    
    zip \               
    unzip \             
    wget \              
    build-essential \   
    libgtk-3-dev \      
    libgconf2-dev \     
    libnss3-dev \       
    libxss1 \           
    libasound2-plugins \    
    libcap2-bin \       
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm install
