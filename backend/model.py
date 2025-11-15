import torch
import torch.nn as nn
import torch.nn.functional as F
import math


class SqueezeExcitation(nn.Module):
    """Channel attention mechanism for better feature selection in drone audio"""
    def __init__(self, channels, reduction=16):
        super().__init__()
        self.fc = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Conv2d(channels, max(channels // reduction, 1), 1),
            nn.ReLU(inplace=True),
            nn.Conv2d(max(channels // reduction, 1), channels, 1),
            nn.Sigmoid()
        )
    
    def forward(self, x):
        return x * self.fc(x)


class CBAM(nn.Module):
    """Convolutional Block Attention Module - combines channel and spatial attention"""
    def __init__(self, channels, reduction=16):
        super().__init__()
        self.channel_attention = SqueezeExcitation(channels, reduction)
        
        # Spatial attention
        self.spatial_conv = nn.Conv2d(2, 1, kernel_size=7, padding=3, bias=False)
        self.sigmoid = nn.Sigmoid()
    
    def forward(self, x):
        # Channel attention
        x = self.channel_attention(x)
        
        # Spatial attention
        avg_out = torch.mean(x, dim=1, keepdim=True)
        max_out, _ = torch.max(x, dim=1, keepdim=True)
        spatial = torch.cat([avg_out, max_out], dim=1)
        spatial = self.sigmoid(self.spatial_conv(spatial))
        
        return x * spatial


class ResidualBlock(nn.Module):
    """Enhanced residual block with attention for drone audio classification"""
    def __init__(self, in_channels, out_channels, stride=1, use_attention=True):
        super().__init__()
        self.conv1 = nn.Conv2d(in_channels, out_channels,
                               3, stride, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(out_channels)
        self.conv2 = nn.Conv2d(out_channels, out_channels,
                               3, padding=1, bias=False)
        self.bn2 = nn.BatchNorm2d(out_channels)
        
        # Add attention mechanism
        self.attention = CBAM(out_channels) if use_attention else None

        self.shortcut = nn.Sequential()
        self.use_shortcut = stride != 1 or in_channels != out_channels
        if self.use_shortcut:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, 1, stride=stride, bias=False), 
                nn.BatchNorm2d(out_channels)
            )
        
        # Initialize weights
        self._init_weights()
    
    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)

    def forward(self, x, fmap_dict=None, prefix=""):
        out = self.conv1(x)
        out = self.bn1(out)
        out = torch.relu(out)
        out = self.conv2(out)
        out = self.bn2(out)
        
        # Apply attention if available
        if self.attention is not None:
            out = self.attention(out)
        
        shortcut = self.shortcut(x) if self.use_shortcut else x
        out_add = out + shortcut

        if fmap_dict is not None:
            fmap_dict[f"{prefix}.conv"] = out_add

        out = torch.relu(out_add)
        if fmap_dict is not None:
            fmap_dict[f"{prefix}.relu"] = out

        return out


class AudioCNN(nn.Module):
    """Enhanced CNN for drone audio classification with attention mechanisms"""
    def __init__(self, num_classes=50, dropout_rate=0.5):
        super().__init__()
        
        # Initial feature extraction with larger kernel for capturing drone harmonics
        self.conv1 = nn.Sequential(
            nn.Conv2d(1, 64, 7, stride=2, padding=3, bias=False),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(3, stride=2, padding=1)
        )
        
        # Residual layers with attention (reduced depth for small datasets)
        self.layer1 = nn.ModuleList([
            ResidualBlock(64, 64, use_attention=False) for _ in range(2)
        ])
        self.layer2 = nn.ModuleList([
            ResidualBlock(64 if i == 0 else 128, 128, stride=2 if i == 0 else 1, use_attention=True) 
            for i in range(2)
        ])
        self.layer3 = nn.ModuleList([
            ResidualBlock(128 if i == 0 else 256, 256, stride=2 if i == 0 else 1, use_attention=True) 
            for i in range(3)
        ])
        self.layer4 = nn.ModuleList([
            ResidualBlock(256 if i == 0 else 512, 512, stride=2 if i == 0 else 1, use_attention=True) 
            for i in range(2)
        ])
        
        # Multi-scale pooling for richer features
        self.avgpool = nn.AdaptiveAvgPool2d((1, 1))
        self.maxpool = nn.AdaptiveMaxPool2d((1, 1))
        
        # Enhanced classifier with batch norm
        self.dropout1 = nn.Dropout(dropout_rate)
        self.fc1 = nn.Linear(1024, 512)  # 512*2 from concat pooling
        self.bn_fc1 = nn.BatchNorm1d(512)
        
        self.dropout2 = nn.Dropout(dropout_rate * 0.7)
        self.fc2 = nn.Linear(512, 256)
        self.bn_fc2 = nn.BatchNorm1d(256)
        
        self.dropout3 = nn.Dropout(dropout_rate * 0.5)
        self.fc3 = nn.Linear(256, num_classes)
        
        # Initialize weights
        self._initialize_weights()
    
    def _initialize_weights(self):
        """Xavier/He initialization for better convergence"""
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode='fan_out', nonlinearity='relu')
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.BatchNorm2d) or isinstance(m, nn.BatchNorm1d):
                nn.init.constant_(m.weight, 1)
                nn.init.constant_(m.bias, 0)
            elif isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight)
                nn.init.constant_(m.bias, 0)

    def forward(self, x, return_feature_maps=False):
        if not return_feature_maps:
            x = self.conv1(x)
            
            for block in self.layer1:
                x = block(x)
            for block in self.layer2:
                x = block(x)
            for block in self.layer3:
                x = block(x)
            for block in self.layer4:
                x = block(x)
            
            # Concat pooling for richer features
            avg_pool = self.avgpool(x)
            max_pool = self.maxpool(x)
            x = torch.cat([avg_pool, max_pool], dim=1)
            x = x.view(x.size(0), -1)
            
            # Enhanced classifier
            x = self.dropout1(x)
            x = self.fc1(x)
            x = self.bn_fc1(x)
            x = F.relu(x)
            
            x = self.dropout2(x)
            x = self.fc2(x)
            x = self.bn_fc2(x)
            x = F.relu(x)
            
            x = self.dropout3(x)
            x = self.fc3(x)
            
            return x
        else:
            feature_maps = {}
            x = self.conv1(x)
            feature_maps["conv1"] = x

            for i, block in enumerate(self.layer1):
                x = block(x, feature_maps, prefix=f"layer1.block{i}")
            feature_maps["layer1"] = x

            for i, block in enumerate(self.layer2):
                x = block(x, feature_maps, prefix=f"layer2.block{i}")
            feature_maps["layer2"] = x

            for i, block in enumerate(self.layer3):
                x = block(x, feature_maps, prefix=f"layer3.block{i}")
            feature_maps["layer3"] = x

            for i, block in enumerate(self.layer4):
                x = block(x, feature_maps, prefix=f"layer4.block{i}")
            feature_maps["layer4"] = x

            # Concat pooling
            avg_pool = self.avgpool(x)
            max_pool = self.maxpool(x)
            x = torch.cat([avg_pool, max_pool], dim=1)
            x = x.view(x.size(0), -1)
            
            # Enhanced classifier
            x = self.dropout1(x)
            x = self.fc1(x)
            x = self.bn_fc1(x)
            x = F.relu(x)
            
            x = self.dropout2(x)
            x = self.fc2(x)
            x = self.bn_fc2(x)
            x = F.relu(x)
            
            x = self.dropout3(x)
            x = self.fc3(x)
            
            return x, feature_maps
    
    def get_feature_extractor(self):
        """Return model without final classification layer for transfer learning"""
        class FeatureExtractor(nn.Module):
            def __init__(self, base_model):
                super().__init__()
                self.base = base_model
            
            def forward(self, x):
                x = self.base.conv1(x)
                
                for block in self.base.layer1:
                    x = block(x)
                for block in self.base.layer2:
                    x = block(x)
                for block in self.base.layer3:
                    x = block(x)
                for block in self.base.layer4:
                    x = block(x)
                
                avg_pool = self.base.avgpool(x)
                max_pool = self.base.maxpool(x)
                x = torch.cat([avg_pool, max_pool], dim=1)
                x = x.view(x.size(0), -1)
                
                x = self.base.dropout1(x)
                x = self.base.fc1(x)
                x = self.base.bn_fc1(x)
                x = F.relu(x)
                
                x = self.base.dropout2(x)
                x = self.base.fc2(x)
                x = self.base.bn_fc2(x)
                x = F.relu(x)
                
                return x
        
        return FeatureExtractor(self)